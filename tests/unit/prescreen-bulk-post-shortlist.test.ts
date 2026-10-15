import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mockGetApprovedJdBase = vi.fn();
const mockGetGatingQuestions = vi.fn();
const mockGetSession = vi.fn();
const mockRoutePrescreen = vi.fn();
const mockResetSession = vi.fn();

vi.mock("@/lib/prescreen/repository", () => ({
  getApprovedJdBase: (...args: unknown[]) => mockGetApprovedJdBase(...args),
  getGatingQuestions: (...args: unknown[]) => mockGetGatingQuestions(...args),
  getSession: (...args: unknown[]) => mockGetSession(...args),
}));

vi.mock("@/lib/prescreen/channel-router", () => ({
  routePrescreenAfterApplication: (...args: unknown[]) => mockRoutePrescreen(...args),
}));

vi.mock("@/lib/prescreen/reset-session", () => ({
  resetIncompletePrescreenSession: (...args: unknown[]) => mockResetSession(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type CandidateSeed = {
  id: string;
  fullName?: string | null;
  phone?: string | null;
  /** candidates.do_not_call (STOP opt-out) */
  doNotCall?: boolean;
  /** post_shortlist prescreen_sessions.state; undefined = no session row */
  sessionState?: string;
  /** prescreen_sessions.questions_sent_at; undefined = null (treated stale) */
  questionsSentAt?: string;
  applicationId?: string;
  /** Recorded post-shortlist answers (question ids from mock gating questions). */
  postShortlistAnswers?: string[];
  /** Question ids answered with a knockout NO (prescreen_responses.passed = false). */
  knockoutAnswers?: string[];
  /** candidate has recorded prescreen_responses rows (legacy flag used by some tests) */
  hasAnswers?: boolean;
};

/**
 * Thenable chainable admin mock backed by seeded candidates. Serves the four
 * reads loadShortlistedCandidates performs (pipeline_stages, pipeline_candidates,
 * applications, prescreen_sessions).
 */
function makeAdmin(seeds: CandidateSeed[], stageNames: string[] = ["Shortlisted"]) {
  const tables: Record<string, unknown[]> = {
    pipeline_stages: stageNames.map((name, i) => ({ id: `stage-${i}`, stage_name: name })),
    pipeline_candidates: seeds.map((s) => ({
      candidate_id: s.id,
      candidates: {
        id: s.id,
        full_name: s.fullName === undefined ? `Name ${s.id}` : s.fullName,
        name: null,
        phone: s.phone ?? null,
        do_not_call: s.doNotCall ?? false,
      },
    })),
    applications: seeds
      .filter((s) => s.applicationId)
      .map((s) => ({ id: s.applicationId, candidate_id: s.id })),
    prescreen_sessions: seeds
      .filter((s) => s.sessionState !== undefined)
      .map((s) => ({
        candidate_id: s.id,
        state: s.sessionState,
        questions_sent_at: s.questionsSentAt ?? null,
      })),
    prescreen_responses: [
      ...seeds.flatMap((s) =>
        (s.postShortlistAnswers ?? []).map((questionId) => ({
          candidate_id: s.id,
          question_id: questionId,
          passed: true,
        })),
      ),
      ...seeds.flatMap((s) =>
        (s.knockoutAnswers ?? []).map((questionId) => ({
          candidate_id: s.id,
          question_id: questionId,
          passed: false,
        })),
      ),
      ...seeds
        .filter(
          (s) => s.hasAnswers && !s.postShortlistAnswers?.length && !s.knockoutAnswers?.length,
        )
        .map((s) => ({ candidate_id: s.id, question_id: "q-1", passed: true })),
    ],
  };

  const admin = {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        then(resolve: (v: { data: unknown[]; error: null }) => void) {
          resolve({ data: tables[table] ?? [], error: null });
        },
      };
      return builder;
    },
  };
  return admin as unknown as SupabaseClient;
}

const SEND_PARAMS = {
  jobId: "job-1",
  organisationId: "org-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApprovedJdBase.mockResolvedValue({ id: "jd-1", roleTitle: "Lead BA" });
  mockGetGatingQuestions.mockResolvedValue([{ id: "q-1" }, { id: "q-2" }]);
  // Per-candidate recheck inside the send loop: default to "no session yet".
  mockGetSession.mockResolvedValue(null);
  mockRoutePrescreen.mockResolvedValue({ started: true });
  mockResetSession.mockResolvedValue(true);
});

describe("previewPostShortlistSend", () => {
  it("classifies candidates into phone/session buckets", async () => {
    const admin = makeAdmin([
      { id: "c-no-phone", phone: null },
      { id: "c-fresh", phone: "9199990001" },
      {
        id: "c-complete",
        phone: "9199990002",
        sessionState: "complete",
        postShortlistAnswers: ["q-1", "q-2"],
      },
      { id: "c-stale", phone: "9199990003", sessionState: "awaiting_consent" },
    ]);

    const { previewPostShortlistSend } = await import("@/lib/prescreen/bulk-post-shortlist");
    const preview = await previewPostShortlistSend(admin, "job-1");

    expect(preview).toEqual({
      shortlistedTotal: 4,
      withPhone: 3,
      withoutPhone: 1,
      screeningComplete: 1,
      alreadyComplete: 1,
      staleIncomplete: 1,
      awaitingConsent: 1,
      inProgress: 0,
      timedOut: 0,
      knockedOut: 0,
      eligibleToSend: 1,
      postShortlistQuestionCount: 2,
    });
  });

  it("classifies a knockout NO as failed, not timed out", async () => {
    const admin = makeAdmin([
      // Session ended early on a knockout NO — must not be "timed out".
      {
        id: "c-knockout",
        phone: "9199990007",
        sessionState: "complete",
        knockoutAnswers: ["q-1"],
      },
      // Session closed without a knockout NO and unanswered questions — timed out.
      {
        id: "c-timeout",
        phone: "9199990008",
        sessionState: "complete",
        postShortlistAnswers: ["q-1"],
      },
    ]);

    const { previewPostShortlistSend } = await import("@/lib/prescreen/bulk-post-shortlist");
    const preview = await previewPostShortlistSend(admin, "job-1");

    expect(preview.timedOut).toBe(1);
    expect(preview.knockedOut).toBe(1);
    expect(preview.screeningComplete).toBe(0);
  });

  it("includes stale incomplete sessions as eligible when forceResend is set", async () => {
    const admin = makeAdmin([
      { id: "c-fresh", phone: "9199990001" },
      { id: "c-stale", phone: "9199990003", sessionState: "in_progress" },
    ]);

    const { previewPostShortlistSend } = await import("@/lib/prescreen/bulk-post-shortlist");
    const preview = await previewPostShortlistSend(admin, "job-1", true);

    expect(preview.eligibleToSend).toBe(2);
    expect(preview.staleIncomplete).toBe(1);
  });

  it("returns zero counts when the job has no shortlist stage", async () => {
    const admin = makeAdmin([{ id: "c-1", phone: "9199990001" }], ["Applied", "Interview"]);

    const { previewPostShortlistSend } = await import("@/lib/prescreen/bulk-post-shortlist");
    const preview = await previewPostShortlistSend(admin, "job-1");

    expect(preview.shortlistedTotal).toBe(0);
    expect(preview.eligibleToSend).toBe(0);
  });

  it("reports question count 0 when the JD base is not approved", async () => {
    mockGetApprovedJdBase.mockResolvedValue(null);
    const admin = makeAdmin([{ id: "c-1", phone: "9199990001" }]);

    const { previewPostShortlistSend } = await import("@/lib/prescreen/bulk-post-shortlist");
    const preview = await previewPostShortlistSend(admin, "job-1");

    expect(preview.postShortlistQuestionCount).toBe(0);
    expect(mockGetGatingQuestions).not.toHaveBeenCalled();
  });
});

describe("sendPostShortlistToShortlisted", () => {
  it("throws before touching candidates when the JD base is not approved", async () => {
    mockGetApprovedJdBase.mockResolvedValue(null);
    const admin = makeAdmin([{ id: "c-1", phone: "9199990001" }]);

    const { sendPostShortlistToShortlisted } = await import("@/lib/prescreen/bulk-post-shortlist");
    await expect(sendPostShortlistToShortlisted({ admin, ...SEND_PARAMS })).rejects.toThrow(
      /Approve the Ideal Profile/,
    );
    expect(mockRoutePrescreen).not.toHaveBeenCalled();
  });

  it("throws when there are no post-shortlist questions", async () => {
    mockGetGatingQuestions.mockResolvedValue([]);
    const admin = makeAdmin([{ id: "c-1", phone: "9199990001" }]);

    const { sendPostShortlistToShortlisted } = await import("@/lib/prescreen/bulk-post-shortlist");
    await expect(sendPostShortlistToShortlisted({ admin, ...SEND_PARAMS })).rejects.toThrow(
      /post-shortlist questions/,
    );
    expect(mockRoutePrescreen).not.toHaveBeenCalled();
  });

  it("dryRun returns counts without sending or resetting anything", async () => {
    const admin = makeAdmin([
      { id: "c-fresh", phone: "9199990001" },
      { id: "c-stale", phone: "9199990002", sessionState: "in_progress" },
    ]);

    const { sendPostShortlistToShortlisted } = await import("@/lib/prescreen/bulk-post-shortlist");
    const result = await sendPostShortlistToShortlisted({
      admin,
      ...SEND_PARAMS,
      dryRun: true,
      forceResend: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.eligibleToSend).toBe(2);
    expect(result.sent).toBe(0);
    expect(result.reset).toBe(0);
    expect(mockRoutePrescreen).not.toHaveBeenCalled();
    expect(mockResetSession).not.toHaveBeenCalled();
  });

  it("sends the shortlist invite template to fresh candidates and skips others", async () => {
    const admin = makeAdmin([
      { id: "c-fresh", fullName: "Asha Rao", phone: "9199990001", applicationId: "app-1" },
      {
        id: "c-complete",
        phone: "9199990002",
        sessionState: "complete",
        postShortlistAnswers: ["q-1", "q-2"],
      },
      { id: "c-no-phone", phone: null },
    ]);

    const { sendPostShortlistToShortlisted } = await import("@/lib/prescreen/bulk-post-shortlist");
    const result = await sendPostShortlistToShortlisted({ admin, ...SEND_PARAMS });

    expect(result.sent).toBe(1);
    // complete + no-phone are never attempted and land in skipped
    expect(result.skipped).toBe(2);
    expect(result.failed).toBe(0);
    expect(mockRoutePrescreen).toHaveBeenCalledTimes(1);
    expect(mockRoutePrescreen).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        candidateId: "c-fresh",
        applicationId: "app-1",
        organisationId: "org-1",
        channel: "whatsapp",
        phone: "9199990001",
        options: expect.objectContaining({
          stage: "post_shortlist",
          setGatePending: false,
          candidateFirstName: "Asha",
        }),
      }),
    );
  });

  it("does not resend to stale incomplete sessions unless forceResend is set", async () => {
    const admin = makeAdmin([
      { id: "c-stale", phone: "9199990002", sessionState: "awaiting_consent" },
    ]);

    const { sendPostShortlistToShortlisted } = await import("@/lib/prescreen/bulk-post-shortlist");
    const result = await sendPostShortlistToShortlisted({ admin, ...SEND_PARAMS });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockResetSession).not.toHaveBeenCalled();
    expect(mockRoutePrescreen).not.toHaveBeenCalled();
  });

  it("forceResend clears stale sessions before resending", async () => {
    const admin = makeAdmin([
      { id: "c-stale", phone: "9199990002", sessionState: "awaiting_consent" },
    ]);
    mockGetSession.mockResolvedValue({ id: "sess-1", state: "awaiting_consent" });

    const { sendPostShortlistToShortlisted } = await import("@/lib/prescreen/bulk-post-shortlist");
    const result = await sendPostShortlistToShortlisted({
      admin,
      ...SEND_PARAMS,
      forceResend: true,
    });

    expect(result.reset).toBe(1);
    expect(result.sent).toBe(1);
    expect(mockResetSession).toHaveBeenCalledWith(admin, {
      jobId: "job-1",
      candidateId: "c-stale",
      stage: "post_shortlist",
    });
  });

  it("does not treat a freshly re-invited session as stale", async () => {
    const admin = makeAdmin([
      {
        id: "c-live",
        phone: "9199990005",
        sessionState: "awaiting_consent",
        questionsSentAt: new Date().toISOString(), // invited minutes ago
      },
    ]);

    const { previewPostShortlistSend, sendPostShortlistToShortlisted } =
      await import("@/lib/prescreen/bulk-post-shortlist");
    const preview = await previewPostShortlistSend(admin, "job-1", true);
    expect(preview.staleIncomplete).toBe(0);
    expect(preview.eligibleToSend).toBe(0);

    const result = await sendPostShortlistToShortlisted({
      admin,
      ...SEND_PARAMS,
      forceResend: true,
    });
    expect(result.reset).toBe(0);
    expect(result.sent).toBe(0);
    expect(mockResetSession).not.toHaveBeenCalled();
  });

  it("forceResend never resets a candidate with recorded answers", async () => {
    const admin = makeAdmin([
      {
        id: "c-partial",
        phone: "9199990006",
        sessionState: "awaiting_reply",
        hasAnswers: true, // mid-questionnaire — answers must survive
      },
    ]);
    mockGetSession.mockResolvedValue({ id: "sess-2", state: "awaiting_reply" });

    const { sendPostShortlistToShortlisted } = await import("@/lib/prescreen/bulk-post-shortlist");
    const result = await sendPostShortlistToShortlisted({
      admin,
      ...SEND_PARAMS,
      forceResend: true,
    });

    expect(result.reset).toBe(0);
    expect(result.sent).toBe(0);
    expect(mockResetSession).not.toHaveBeenCalled();
  });

  it("skips a candidate whose session completed between load and send", async () => {
    const admin = makeAdmin([
      {
        id: "c-fresh",
        phone: "9199990001",
        sessionState: "complete",
        postShortlistAnswers: ["q-1", "q-2"],
      },
    ]);
    mockGetSession.mockResolvedValue({ id: "sess-1", state: "complete" });

    const { sendPostShortlistToShortlisted } = await import("@/lib/prescreen/bulk-post-shortlist");
    const result = await sendPostShortlistToShortlisted({ admin, ...SEND_PARAMS });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockRoutePrescreen).not.toHaveBeenCalled();
  });

  it("counts router no-ops as skipped and router throws as failed", async () => {
    const admin = makeAdmin([
      { id: "c-noop", phone: "9199990001" },
      { id: "c-boom", phone: "9199990002" },
    ]);
    mockRoutePrescreen.mockImplementation(async (params: { candidateId: string }) => {
      if (params.candidateId === "c-boom") throw new Error("template rejected");
      return { started: false, reason: "org screening off" };
    });

    const { sendPostShortlistToShortlisted } = await import("@/lib/prescreen/bulk-post-shortlist");
    const result = await sendPostShortlistToShortlisted({ admin, ...SEND_PARAMS });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("never sends to opted-out (do_not_call) candidates, even with forceResend", async () => {
    const admin = makeAdmin([
      { id: "c-opted-out", phone: "9199990001", doNotCall: true },
      {
        id: "c-opted-out-stale",
        phone: "9199990002",
        doNotCall: true,
        sessionState: "awaiting_consent",
      },
      { id: "c-ok", phone: "9199990003" },
    ]);

    const { sendPostShortlistToShortlisted } = await import("@/lib/prescreen/bulk-post-shortlist");
    const result = await sendPostShortlistToShortlisted({
      admin,
      ...SEND_PARAMS,
      forceResend: true,
    });

    expect(result.sent).toBe(1);
    expect(mockRoutePrescreen).toHaveBeenCalledTimes(1);
    expect(mockRoutePrescreen).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId: "c-ok" }),
    );
    expect(result.withoutPhone).toBe(2); // opted-out counted as uncontactable
  });

  it("restricts the send to the provided candidateIds", async () => {
    const admin = makeAdmin([
      { id: "c-1", phone: "9199990001" },
      { id: "c-2", phone: "9199990002" },
    ]);

    const { sendPostShortlistToShortlisted } = await import("@/lib/prescreen/bulk-post-shortlist");
    const result = await sendPostShortlistToShortlisted({
      admin,
      ...SEND_PARAMS,
      candidateIds: ["c-2"],
    });

    expect(result.sent).toBe(1);
    expect(mockRoutePrescreen).toHaveBeenCalledTimes(1);
    expect(mockRoutePrescreen).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId: "c-2" }),
    );
  });
});
