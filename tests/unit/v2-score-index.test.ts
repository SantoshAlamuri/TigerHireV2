import { describe, it, expect } from "vitest";
import {
  indexScoresByCandidate,
  pickScoreFor,
  candidateIdByUniqueName,
} from "@/lib/v2/score-index";

/**
 * Every application row carries a fit_scores join keyed off
 * applications.fit_score_id — and that column is null on every row in the
 * database. The join therefore resolves to nothing, and the score, which is the
 * product's entire output, renders as an em dash on every screen that trusts
 * it. The review queue looked fine only because it fetches scores separately.
 *
 * This indexes what /api/fit-score returns so the same lookup works everywhere,
 * without depending on a foreign key nothing populates.
 */
const s = (over: Partial<Parameters<typeof indexScoresByCandidate>[0][number]> = {}) => ({
  candidate_id: "c1",
  job_id: "j1",
  overall_score: 70,
  created_at: "2026-07-01T00:00:00Z",
  ...over,
});

describe("indexScoresByCandidate", () => {
  it("keys scores by candidate", () => {
    const idx = indexScoresByCandidate([s(), s({ candidate_id: "c2", overall_score: 40 })]);
    expect(idx.get("c1")?.overall_score).toBe(70);
    expect(idx.get("c2")?.overall_score).toBe(40);
  });

  it("keeps the most recent score when a candidate was scored more than once", () => {
    const idx = indexScoresByCandidate([
      s({ overall_score: 55, created_at: "2026-06-01T00:00:00Z" }),
      s({ overall_score: 79, created_at: "2026-07-20T00:00:00Z" }),
    ]);
    expect(idx.get("c1")?.overall_score).toBe(79);
  });

  it("does not let an undated row displace a dated one", () => {
    const idx = indexScoresByCandidate([
      s({ overall_score: 79, created_at: "2026-07-20T00:00:00Z" }),
      s({ overall_score: 12, created_at: null }),
    ]);
    expect(idx.get("c1")?.overall_score).toBe(79);
  });

  it("ignores rows with no candidate to attach to", () => {
    const idx = indexScoresByCandidate([s({ candidate_id: null })]);
    expect(idx.size).toBe(0);
  });
});

describe("pickScoreFor", () => {
  const rows = [
    s({ job_id: "j1", overall_score: 70 }),
    s({ job_id: "j2", overall_score: 88, created_at: "2026-07-25T00:00:00Z" }),
  ];

  it("prefers the score for the job being looked at", () => {
    expect(pickScoreFor(rows, "j1")?.overall_score).toBe(70);
  });

  it("falls back to the most recent score when the job has none", () => {
    expect(pickScoreFor(rows, "j-none")?.overall_score).toBe(88);
  });

  it("returns null rather than a stand-in when there are no scores", () => {
    expect(pickScoreFor([], "j1")).toBeNull();
  });
});

describe("candidateIdByUniqueName", () => {
  it("maps a name to its candidate when the name is unambiguous", () => {
    const m = candidateIdByUniqueName([
      { candidate_id: "c1", candidates: { name: "Dev P." } },
      { candidate_id: "c2", candidates: { name: "Meera J." } },
    ]);
    expect(m.get("dev p.")).toBe("c1");
  });

  it("refuses to map a name shared by two people", () => {
    // Interviews arrive with a name and no id. Guessing between two people who
    // share a name would put one candidate's score against the other's
    // interview, which is worse than showing nothing.
    const m = candidateIdByUniqueName([
      { candidate_id: "c1", candidates: { name: "Rahul S." } },
      { candidate_id: "c2", candidates: { name: "Rahul S." } },
    ]);
    expect(m.has("rahul s.")).toBe(false);
  });

  it("ignores blank names rather than collapsing them into one key", () => {
    const m = candidateIdByUniqueName([
      { candidate_id: "c1", candidates: { name: "  " } },
      { candidate_id: "c2", candidates: { name: null } },
    ]);
    expect(m.size).toBe(0);
  });

  it("matches regardless of case and surrounding space", () => {
    const m = candidateIdByUniqueName([{ candidate_id: "c1", candidates: { name: " Dev P. " } }]);
    expect(m.get("dev p.")).toBe("c1");
  });
});
