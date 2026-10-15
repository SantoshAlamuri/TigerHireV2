import { describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder, createMockSupabase } from "../helpers";
import { loadReviewBatch } from "@/lib/repositories/review-batch";

describe("globally ranked review batch", () => {
  it("filters pending scores before limiting and embeds each selected candidate's evidence", async () => {
    const score = createMockQueryBuilder({
      data: [
        {
          candidate_id: "candidate-101",
          overall_score: 95,
          evidence_json: { quotes: [{ quote: "Built the service" }] },
        },
        {
          candidate_id: "candidate-102",
          overall_score: 80,
          evidence_json: { quotes: [{ quote: "Operated the service" }] },
        },
      ],
    });
    const counted = createMockQueryBuilder({ data: null, count: 151 });
    const apps = createMockQueryBuilder({
      data: [
        { id: "app-102", candidate_id: "candidate-102" },
        { id: "app-101", candidate_id: "candidate-101" },
      ],
    });
    const db = createMockSupabase({ fit_scores: score });
    let calls = 0;
    db.from = vi.fn((table: string) =>
      table === "fit_scores" ? score : calls++ === 0 ? counted : apps,
    ) as typeof db.from;
    const result = await loadReviewBatch(db, "job-1", 2);
    expect(score.eq).toHaveBeenCalledWith("candidates.applications.status", "applied");
    expect(score.eq).toHaveBeenCalledWith("candidates.applications.job_id", "job-1");
    expect(score.is).toHaveBeenCalledWith("superseded_at", null);
    expect(score.limit).toHaveBeenCalledWith(2);
    expect(score.order).toHaveBeenCalledWith("candidate_id", { ascending: true });
    expect(result.total).toBe(151);
    expect(result.applications.map((row) => row.id)).toEqual(["app-101", "app-102"]);
    expect(result.applications[0].fit_scores?.evidence_json).toEqual({
      quotes: [{ quote: "Built the service" }],
    });
  });
  it("includes a genuinely unscored candidate after scored candidates are exhausted", async () => {
    const score = createMockQueryBuilder({ data: [] });
    const counted = createMockQueryBuilder({ data: null, count: 1 });
    const apps = createMockQueryBuilder({
      data: [{ id: "app-new", candidate_id: "candidate-new" }],
    });
    const db = createMockSupabase({ fit_scores: score });
    let calls = 0;
    db.from = vi.fn((table: string) =>
      table === "fit_scores" ? score : calls++ === 0 ? counted : apps,
    ) as typeof db.from;
    const result = await loadReviewBatch(db, "job-1", 2);
    expect(result.applications[0].fit_scores).toBeNull();
    expect(apps.eq).toHaveBeenCalledWith("status", "applied");
    expect(apps.limit).toHaveBeenCalledWith(2);
  });

  it("excludes already-ranked UUID candidates with a PostgREST in-list", async () => {
    const rankedId = "11111111-1111-4111-8111-111111111111";
    const score = createMockQueryBuilder({
      data: [{ candidate_id: rankedId, overall_score: 91, evidence_json: null }],
    });
    const counted = createMockQueryBuilder({ data: null, count: 2 });
    const matched = createMockQueryBuilder({
      data: [{ id: "app-ranked", candidate_id: rankedId }],
    });
    const fallback = createMockQueryBuilder({
      data: [{ id: "app-new", candidate_id: "22222222-2222-4222-8222-222222222222" }],
    });
    const db = createMockSupabase({ fit_scores: score });
    let calls = 0;
    db.from = vi.fn((table: string) => {
      if (table === "fit_scores") return score;
      if (calls++ === 0) return counted;
      return calls === 2 ? matched : fallback;
    }) as typeof db.from;
    const result = await loadReviewBatch(db, "job-1", 2);
    expect(fallback.not).toHaveBeenCalledWith("candidate_id", "in", `(${rankedId})`);
    expect(result.applications.map((row) => row.id)).toEqual(["app-ranked", "app-new"]);
    expect(result.nextCursor).toBeUndefined();
  });
});
