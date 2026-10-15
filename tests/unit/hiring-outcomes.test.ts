import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function createChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ error: null }),
  };
  return chain;
}

describe("upsertHiringOutcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses rpc conflict-safe upsert with source/source_event_id", async () => {
    const jobsChain = createChain({
      data: { organisation_id: "org-1" },
      error: null,
    });
    const scoresChain = createChain({
      data: {
        id: "fs-1",
        overall_score: 64,
        primary_score: 70,
        scoring_version: 2,
        band: "Good Fit",
        extraction_model: "haiku",
        parse_quality_score: 0.92,
      },
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === "jobs") return jobsChain;
      if (table === "fit_scores") return scoresChain;
      return createChain({ data: null, error: null });
    });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const admin = { from, rpc };

    const { upsertHiringOutcome } = await import("@/lib/services/hiring-outcomes");
    await upsertHiringOutcome(admin as never, {
      jobId: "job-1",
      candidateId: "cand-1",
      outcome: "hired",
      recordedByUserId: "user-1",
      source: "application_service",
      sourceEventId: "application:app-1:hired",
    });

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][0]).toBe("upsert_hiring_outcome_signal");
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_job_id: "job-1",
      p_candidate_id: "cand-1",
      p_outcome: "hired",
      p_source: "application_service",
      p_source_event_id: "application:app-1:hired",
      p_fit_score_value: 70,
      p_scoring_version: 2,
    });
  });

  it("falls back to update path when rpc is unavailable", async () => {
    const jobsChain = createChain({
      data: { organisation_id: "org-1" },
      error: null,
    });
    const scoresChain = createChain({
      data: null,
      error: null,
    });
    const existingLookupChain = createChain({
      data: { id: "outcome-1" },
      error: null,
    });
    const updateChain = createChain({
      data: null,
      error: null,
    });
    let hiringOutcomesFromCount = 0;
    const from = vi.fn((table: string) => {
      if (table === "jobs") return jobsChain;
      if (table === "fit_scores") return scoresChain;
      if (table === "hiring_outcomes") {
        hiringOutcomesFromCount += 1;
        return hiringOutcomesFromCount === 1 ? existingLookupChain : updateChain;
      }
      return createChain({ data: null, error: null });
    });
    const rpc = vi
      .fn()
      .mockResolvedValue({ error: { message: "function missing", code: "42883" } });
    const admin = { from, rpc };

    const { upsertHiringOutcome } = await import("@/lib/services/hiring-outcomes");
    await upsertHiringOutcome(admin as never, {
      jobId: "job-1",
      candidateId: "cand-1",
      outcome: "rejected",
      recordedByUserId: "user-1",
      source: "feedback_hire_api",
      sourceEventId: "feedback-hire:job-1:cand-1:rejected",
    });

    expect(updateChain.update).toHaveBeenCalledOnce();
  });
});
