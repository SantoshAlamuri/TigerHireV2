import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockGetApprovedJdBase = vi.fn();
const mockGetGatingQuestions = vi.fn();
const mockResetIncomplete = vi.fn();
const mockRoute = vi.fn();

vi.mock("@/lib/prescreen/repository", () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  getApprovedJdBase: (...args: unknown[]) => mockGetApprovedJdBase(...args),
  getGatingQuestions: (...args: unknown[]) => mockGetGatingQuestions(...args),
}));

vi.mock("@/lib/prescreen/reset-session", () => ({
  resetIncompletePrescreenSession: (...args: unknown[]) => mockResetIncomplete(...args),
}));

vi.mock("@/lib/prescreen/channel-router", () => ({
  routePrescreenAfterApplication: (...args: unknown[]) => mockRoute(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// prescreen_responses answer probe + candidates phone lookup.
let answeredRows: Array<{ question_id: string }> = [];
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in"]) {
        builder[m] = () => builder;
      }
      builder.limit = async () =>
        table === "prescreen_responses"
          ? { data: answeredRows, error: null }
          : { data: [], error: null };
      builder.maybeSingle = async () =>
        table === "candidates"
          ? { data: { phone: "919999900001", name: "Asha", full_name: "Asha Rao" }, error: null }
          : { data: null, error: null };
      return builder;
    },
  }),
}));

import { maybeStartPostShortlistScreening } from "@/lib/prescreen/post-shortlist-trigger";

const args = {
  jobId: "job-1",
  candidateId: "cand-1",
  organisationId: "org-1",
  stageName: "Shortlisted",
};

beforeEach(() => {
  vi.clearAllMocks();
  answeredRows = [];
  mockGetApprovedJdBase.mockResolvedValue({ id: "jd-1", roleTitle: "Lead BA" });
  mockGetGatingQuestions.mockResolvedValue([{ id: "q1" }, { id: "q2" }]);
  mockResetIncomplete.mockResolvedValue(true);
  mockRoute.mockResolvedValue({ started: true, sessionId: "sess-1", questionCount: 2 });
});

describe("maybeStartPostShortlistScreening — stage-drag answer guard", () => {
  it("does NOT reset a session when the candidate has recorded post-shortlist answers (resume, not restart)", async () => {
    mockGetSession.mockResolvedValue({ id: "sess-1", state: "awaiting_reply" });
    answeredRows = [{ question_id: "q1" }];

    await maybeStartPostShortlistScreening(args);

    expect(mockResetIncomplete).not.toHaveBeenCalled();
    expect(mockRoute).not.toHaveBeenCalled(); // live round left alone to resume
  });

  it("resets a truly-unstarted stale session (zero answers) and re-invites", async () => {
    mockGetSession.mockResolvedValue({ id: "sess-1", state: "awaiting_consent" });
    answeredRows = [];

    await maybeStartPostShortlistScreening(args);

    expect(mockResetIncomplete).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ jobId: "job-1", candidateId: "cand-1", stage: "post_shortlist" }),
    );
    expect(mockRoute).toHaveBeenCalledTimes(1);
  });

  it("is a no-op for completed sessions", async () => {
    mockGetSession.mockResolvedValue({ id: "sess-1", state: "complete" });

    await maybeStartPostShortlistScreening(args);

    expect(mockResetIncomplete).not.toHaveBeenCalled();
    expect(mockRoute).not.toHaveBeenCalled();
  });

  it("starts a fresh round when no session exists", async () => {
    mockGetSession.mockResolvedValue(null);

    await maybeStartPostShortlistScreening(args);

    expect(mockResetIncomplete).not.toHaveBeenCalled();
    expect(mockRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        candidateId: "cand-1",
        options: expect.objectContaining({ stage: "post_shortlist" }),
      }),
    );
  });

  it("ignores non-shortlist stage names", async () => {
    await maybeStartPostShortlistScreening({ ...args, stageName: "Interview" });
    expect(mockGetSession).not.toHaveBeenCalled();
  });
});
