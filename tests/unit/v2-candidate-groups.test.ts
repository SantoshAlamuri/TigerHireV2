import { describe, it, expect } from "vitest";
import { groupCandidatesByJob, type CandidateRow } from "@/lib/v2/candidate-groups";

/**
 * Operator ask: "candidates page should be a DB by role instead of a long list
 * of people." Grouping is the default; search and filters refine rather than
 * being a prerequisite for the page to say anything.
 */
function row(over: Partial<CandidateRow> = {}): CandidateRow {
  return {
    applicationId: "a1",
    candidateId: "c1",
    name: "Someone",
    jobId: "j1",
    jobTitle: "Backend Engineer",
    score: 70,
    status: "applied",
    ...over,
  };
}

describe("groupCandidatesByJob", () => {
  it("preserves a measured zero above a missing score", () => {
    const result = groupCandidatesByJob([
      row({ applicationId: "missing", score: null }),
      row({ applicationId: "zero", score: 0 }),
    ]);
    expect(result.groups[0].rows.map((r) => r.score)).toEqual([0, null]);
  });

  it("returns no groups for no rows", () => {
    const g = groupCandidatesByJob([]);
    expect(g.groups).toEqual([]);
    expect(g.pool).toEqual([]);
    expect(g.total).toBe(0);
  });

  it("groups people under the job they are in process for", () => {
    const g = groupCandidatesByJob([
      row({ applicationId: "a1", jobId: "j1", jobTitle: "Backend" }),
      row({ applicationId: "a2", jobId: "j1", jobTitle: "Backend" }),
      row({ applicationId: "a3", jobId: "j2", jobTitle: "Design" }),
    ]);
    expect(g.groups).toHaveLength(2);
    expect(g.groups[0].jobTitle).toBe("Backend");
    expect(g.groups[0].rows).toHaveLength(2);
  });

  it("sorts each group by score, best first", () => {
    const g = groupCandidatesByJob([
      row({ applicationId: "a1", score: 61 }),
      row({ applicationId: "a2", score: 88 }),
      row({ applicationId: "a3", score: 74 }),
    ]);
    expect(g.groups[0].rows.map((r) => r.score)).toEqual([88, 74, 61]);
  });

  it("orders groups by how many active people they hold", () => {
    const g = groupCandidatesByJob([
      row({ applicationId: "a1", jobId: "j1", jobTitle: "Small" }),
      row({ applicationId: "a2", jobId: "j2", jobTitle: "Big" }),
      row({ applicationId: "a3", jobId: "j2", jobTitle: "Big" }),
    ]);
    expect(g.groups.map((x) => x.jobTitle)).toEqual(["Big", "Small"]);
  });

  it("moves rejected people out of the job groups and into the talent pool", () => {
    const g = groupCandidatesByJob([
      row({ applicationId: "a1", status: "applied" }),
      row({ applicationId: "a2", status: "rejected", rejectionReason: "compensation" }),
    ]);
    expect(g.groups[0].rows).toHaveLength(1);
    expect(g.pool).toHaveLength(1);
    expect(g.pool[0].rejectionReason).toBe("compensation");
  });

  it("keeps hired people visible in their job group — they are the outcome", () => {
    const g = groupCandidatesByJob([row({ status: "hired" })]);
    expect(g.groups[0].rows).toHaveLength(1);
    expect(g.pool).toEqual([]);
  });

  it("counts pool entries by reason so the page can offer them as filters", () => {
    const g = groupCandidatesByJob([
      row({ applicationId: "a1", status: "rejected", rejectionReason: "compensation" }),
      row({ applicationId: "a2", status: "rejected", rejectionReason: "compensation" }),
      row({ applicationId: "a3", status: "rejected", rejectionReason: "location" }),
      row({ applicationId: "a4", status: "rejected", rejectionReason: null }),
    ]);
    expect(g.poolByReason).toEqual({ compensation: 2, location: 1, unspecified: 1 });
  });

  it("falls back to a readable label when a job has no title", () => {
    const g = groupCandidatesByJob([row({ jobTitle: "" })]);
    expect(g.groups[0].jobTitle).toBe("Untitled job");
  });

  it("counts every person once across groups and pool", () => {
    const g = groupCandidatesByJob([
      row({ applicationId: "a1" }),
      row({ applicationId: "a2", status: "rejected" }),
      row({ applicationId: "a3", jobId: "j2", jobTitle: "Other" }),
    ]);
    expect(g.total).toBe(3);
    expect(g.groups.reduce((n, x) => n + x.rows.length, 0) + g.pool.length).toBe(3);
  });
});
