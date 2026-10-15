import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostShortlistCandidate } from "@/lib/prescreen/bulk-post-shortlist";

const mockGetApprovedJdBase = vi.fn();
const mockGetGatingQuestions = vi.fn();
const mockGetSession = vi.fn();
const mockUpdateSession = vi.fn();
const mockSendTemplateMessage = vi.fn();
const mockScheduleLifecycle = vi.fn();
const mockLoadShortlisted = vi.fn();

vi.mock("@/lib/prescreen/repository", () => ({
  getApprovedJdBase: (...args: unknown[]) => mockGetApprovedJdBase(...args),
  getGatingQuestions: (...args: unknown[]) => mockGetGatingQuestions(...args),
  getSession: (...args: unknown[]) => mockGetSession(...args),
  updateSession: (...args: unknown[]) => mockUpdateSession(...args),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendTemplateMessage: (...args: unknown[]) => mockSendTemplateMessage(...args),
}));

vi.mock("@/lib/prescreen/schedule-lifecycle", () => ({
  schedulePrescreenLifecycle: (...args: unknown[]) => mockScheduleLifecycle(...args),
}));

vi.mock("@/lib/prescreen/bulk-post-shortlist", () => ({
  loadShortlistedCandidates: (...args: unknown[]) => mockLoadShortlisted(...args),
}));

vi.mock("@/lib/screening/org-whatsapp-screening", () => ({
  getOrgDisplayName: async () => "Masai School",
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function candidate(over: Partial<PostShortlistCandidate>): PostShortlistCandidate {
  return {
    candidateId: "c-1",
    applicationId: "app-1",
    fullName: "Asha Rao",
    phone: "919999900001",
    doNotCall: false,
    sessionState: "complete",
    sessionQuestionsSentAt: null,
    sessionDeclinedAt: null,
    postShortlistAnswerCount: 0,
    ...over,
  };
}

/** Thenable admin stub for the prescreen_responses read. */
function makeAdmin(responses: Array<{ candidate_id: string; passed: boolean }>) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    then(resolve: (v: { data: unknown[]; error: null }) => void) {
      resolve({ data: responses, error: null });
    },
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApprovedJdBase.mockResolvedValue({ id: "jd-1", roleTitle: "Lead BA" });
  mockGetGatingQuestions.mockResolvedValue([{ id: "q-1" }, { id: "q-2" }]);
  mockGetSession.mockResolvedValue({ id: "sess-1", state: "complete" });
  mockUpdateSession.mockResolvedValue(undefined);
  mockSendTemplateMessage.mockResolvedValue({ success: true });
  mockScheduleLifecycle.mockResolvedValue(undefined);
});

describe("renudgePostShortlistNonResponders", () => {
  it("re-nudges timed-out partial responders and reopens the session as awaiting_consent", async () => {
    mockLoadShortlisted.mockResolvedValue([candidate({ candidateId: "c-partial" })]);
    const admin = makeAdmin([{ candidate_id: "c-partial", passed: true }]);

    const { renudgePostShortlistNonResponders } =
      await import("@/lib/prescreen/renudge-post-shortlist");
    const result = await renudgePostShortlistNonResponders(admin, {
      jobId: "job-1",
      organisationId: "org-1",
      dryRun: false,
    });

    expect(result.eligible).toBe(1);
    expect(result.sent).toBe(1);
    expect(mockSendTemplateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ templateName: "th_shortlisted" }),
    );
    expect(mockUpdateSession).toHaveBeenCalledWith(
      expect.anything(),
      "sess-1",
      expect.objectContaining({ state: "awaiting_consent" }),
    );
  });

  it("excludes opted-out (do_not_call) candidates from re-nudge eligibility", async () => {
    mockLoadShortlisted.mockResolvedValue([
      candidate({ candidateId: "c-stopped", doNotCall: true }),
      candidate({ candidateId: "c-ok", phone: "919999900002" }),
    ]);
    const admin = makeAdmin([]);

    const { renudgePostShortlistNonResponders } =
      await import("@/lib/prescreen/renudge-post-shortlist");
    const result = await renudgePostShortlistNonResponders(admin, {
      jobId: "job-1",
      organisationId: "org-1",
      dryRun: false,
    });

    expect(result.eligible).toBe(1);
    expect(result.targets.map((t) => t.candidateId)).toEqual(["c-ok"]);
    expect(mockSendTemplateMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTemplateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumber: "919999900002" }),
    );
  });

  it("excludes candidates who explicitly declined consent (declined_at set)", async () => {
    // A decline ends as state=complete with zero responses — same shape as a
    // timeout. declined_at is the disambiguator and must block the re-invite.
    mockLoadShortlisted.mockResolvedValue([
      candidate({
        candidateId: "c-declined",
        sessionDeclinedAt: "2026-07-09T10:00:00.000Z",
      }),
      candidate({ candidateId: "c-timed-out", phone: "919999900003" }),
    ]);
    const admin = makeAdmin([]);

    const { renudgePostShortlistNonResponders } =
      await import("@/lib/prescreen/renudge-post-shortlist");
    const result = await renudgePostShortlistNonResponders(admin, {
      jobId: "job-1",
      organisationId: "org-1",
      dryRun: false,
    });

    expect(result.eligible).toBe(1);
    expect(result.targets.map((t) => t.candidateId)).toEqual(["c-timed-out"]);
    expect(mockSendTemplateMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTemplateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumber: "919999900003" }),
    );
  });

  it("dryRun reports targets without sending", async () => {
    mockLoadShortlisted.mockResolvedValue([candidate({ candidateId: "c-partial" })]);
    const admin = makeAdmin([]);

    const { renudgePostShortlistNonResponders } =
      await import("@/lib/prescreen/renudge-post-shortlist");
    const result = await renudgePostShortlistNonResponders(admin, {
      jobId: "job-1",
      organisationId: "org-1",
      dryRun: true,
    });

    expect(result.eligible).toBe(1);
    expect(result.sent).toBe(0);
    expect(mockSendTemplateMessage).not.toHaveBeenCalled();
  });
});
