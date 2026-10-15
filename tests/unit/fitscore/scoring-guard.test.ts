import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("scoring-guard", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("findRecentFitScoreForDedupe returns row when scored recently", async () => {
    const row = {
      id: "fs1",
      job_id: "j1",
      candidate_id: "c1",
      overall_score: 72,
      band: "Good Fit",
      one_line_summary: "ok",
      scoring_status: "scored",
      created_at: new Date().toISOString(),
    };
    const builder = createMockQueryBuilder({ data: row });
    const supabase = createMockSupabase({ fit_scores: builder });

    const { findRecentFitScoreForDedupe } = await import("@/lib/fitscore/scoring-guard");
    const result = await findRecentFitScoreForDedupe(supabase, "j1", "c1");
    expect(result?.overall_score).toBe(72);
  });

  it("buildDedupeSkipResult maps existing score", async () => {
    const { buildDedupeSkipResult } = await import("@/lib/fitscore/scoring-guard");
    const out = buildDedupeSkipResult({
      id: "fs1",
      job_id: "j1",
      candidate_id: "c1",
      overall_score: 80,
      band: null,
      one_line_summary: null,
      scoring_status: "scored",
      created_at: new Date().toISOString(),
    });
    expect(out).toMatchObject({
      scoring_status: "deduped",
      fitScore: 80,
      deduped: true,
    });
  });
});
