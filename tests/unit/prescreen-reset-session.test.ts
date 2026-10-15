import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mockGetSession = vi.fn();
const mockGetApprovedJdBase = vi.fn();
const mockGetGatingQuestions = vi.fn();

vi.mock("@/lib/prescreen/repository", () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  getApprovedJdBase: (...args: unknown[]) => mockGetApprovedJdBase(...args),
  getGatingQuestions: (...args: unknown[]) => mockGetGatingQuestions(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type DeleteCall = { table: string; filters: Record<string, unknown> };

/** Chainable thenable admin mock recording delete calls per table. */
function makeAdmin(
  deleteErrors: Record<string, { message: string } | null> = {},
  selectData: Record<string, unknown[]> = {},
) {
  const deletes: DeleteCall[] = [];
  const admin = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let mode: "select" | "delete" | null = null;
      const builder = {
        select: () => {
          mode = "select";
          return builder;
        },
        delete: () => {
          mode = "delete";
          return builder;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return builder;
        },
        in(col: string, vals: unknown[]) {
          filters[col] = vals;
          return builder;
        },
        then(resolve: (v: { data?: unknown[]; error: { message: string } | null }) => void) {
          if (mode === "select") {
            resolve({ data: selectData[table] ?? [], error: null });
            return;
          }
          deletes.push({ table, filters });
          resolve({ error: deleteErrors[table] ?? null });
        },
      };
      return builder;
    },
  };
  return { admin: admin as unknown as SupabaseClient, deletes };
}

const PARAMS = {
  jobId: "job-1",
  candidateId: "cand-1",
  stage: "post_shortlist" as const,
};

describe("resetIncompletePrescreenSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApprovedJdBase.mockResolvedValue({ id: "jd-1", roleTitle: "Lead BA" });
    mockGetGatingQuestions.mockResolvedValue([{ id: "q-1" }, { id: "q-2" }]);
  });

  it("returns false and deletes nothing when there is no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const { admin, deletes } = makeAdmin();

    const { resetIncompletePrescreenSession } = await import("@/lib/prescreen/reset-session");
    await expect(resetIncompletePrescreenSession(admin, PARAMS)).resolves.toBe(false);
    expect(deletes).toHaveLength(0);
  });

  it("leaves fully screened sessions untouched", async () => {
    mockGetSession.mockResolvedValue({ id: "sess-1", state: "complete" });
    const { admin, deletes } = makeAdmin(
      {},
      {
        prescreen_responses: [{ question_id: "q-1" }, { question_id: "q-2" }],
      },
    );

    const { resetIncompletePrescreenSession } = await import("@/lib/prescreen/reset-session");
    await expect(resetIncompletePrescreenSession(admin, PARAMS)).resolves.toBe(false);
    expect(deletes).toHaveLength(0);
  });

  it("resets timed-out complete sessions that never finished all questions", async () => {
    mockGetSession.mockResolvedValue({ id: "sess-1", state: "complete" });
    const { admin, deletes } = makeAdmin({}, { prescreen_responses: [] });

    const { resetIncompletePrescreenSession } = await import("@/lib/prescreen/reset-session");
    await expect(resetIncompletePrescreenSession(admin, PARAMS)).resolves.toBe(true);
    expect(deletes.map((d) => d.table)).toEqual(["prescreen_responses", "prescreen_sessions"]);
  });

  it("deletes stage-scoped responses and the session for an incomplete session", async () => {
    mockGetSession.mockResolvedValue({ id: "sess-1", state: "awaiting_consent" });
    const { admin, deletes } = makeAdmin();

    const { resetIncompletePrescreenSession } = await import("@/lib/prescreen/reset-session");
    await expect(resetIncompletePrescreenSession(admin, PARAMS)).resolves.toBe(true);

    expect(deletes).toEqual([
      {
        table: "prescreen_responses",
        filters: { job_id: "job-1", candidate_id: "cand-1", question_id: ["q-1", "q-2"] },
      },
      { table: "prescreen_sessions", filters: { id: "sess-1" } },
    ]);
    // Responses are scoped to this stage's question ids — other stages' answers survive.
    expect(mockGetGatingQuestions).toHaveBeenCalledWith(admin, "jd-1", "post_shortlist");
  });

  it("still deletes the session when there is no approved JD base", async () => {
    mockGetSession.mockResolvedValue({ id: "sess-2", state: "in_progress" });
    mockGetApprovedJdBase.mockResolvedValue(null);
    const { admin, deletes } = makeAdmin();

    const { resetIncompletePrescreenSession } = await import("@/lib/prescreen/reset-session");
    await expect(resetIncompletePrescreenSession(admin, PARAMS)).resolves.toBe(true);
    expect(deletes).toEqual([{ table: "prescreen_sessions", filters: { id: "sess-2" } }]);
  });

  it("skips the response delete when the stage has no gating questions", async () => {
    mockGetSession.mockResolvedValue({ id: "sess-3", state: "in_progress" });
    mockGetGatingQuestions.mockResolvedValue([]);
    const { admin, deletes } = makeAdmin();

    const { resetIncompletePrescreenSession } = await import("@/lib/prescreen/reset-session");
    await expect(resetIncompletePrescreenSession(admin, PARAMS)).resolves.toBe(true);
    expect(deletes).toEqual([{ table: "prescreen_sessions", filters: { id: "sess-3" } }]);
  });

  it("throws when the response delete fails, leaving the session in place", async () => {
    mockGetSession.mockResolvedValue({ id: "sess-4", state: "in_progress" });
    const { admin, deletes } = makeAdmin({
      prescreen_responses: { message: "boom" },
    });

    const { resetIncompletePrescreenSession } = await import("@/lib/prescreen/reset-session");
    await expect(resetIncompletePrescreenSession(admin, PARAMS)).rejects.toBeTruthy();
    expect(deletes.map((d) => d.table)).toEqual(["prescreen_responses"]);
  });
});
