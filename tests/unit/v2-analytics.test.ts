import { describe, it, expect } from "vitest";
import { computeFunnel, computeSourceOfHire, computeRejectMix } from "@/lib/v2/analytics";

/**
 * "Difficult reporting and analytics" is the top G2 complaint about the
 * incumbent this product competes with, so the numbers have to be honest,
 * derived, and never silently wrong.
 */
describe("computeFunnel", () => {
  it("is all zeros with no applications", () => {
    const f = computeFunnel([]);
    expect(f.applied).toBe(0);
    expect(f.conversion.appliedToShortlist).toBe(0);
  });

  it("counts each stage from application statuses", () => {
    const f = computeFunnel([
      { status: "applied" },
      { status: "viewed" },
      { status: "shortlisted" },
      { status: "shortlisted" },
      { status: "hired" },
      { status: "rejected" },
    ]);
    expect(f.applied).toBe(6);
    expect(f.shortlisted).toBe(3); // shortlisted + hired both cleared the shortlist bar
    expect(f.hired).toBe(1);
    expect(f.rejected).toBe(1);
  });

  it("expresses conversion as whole percentages", () => {
    const f = computeFunnel([
      { status: "applied" },
      { status: "applied" },
      { status: "applied" },
      { status: "shortlisted" },
    ]);
    expect(f.conversion.appliedToShortlist).toBe(25);
  });

  it("never divides by zero", () => {
    expect(() => computeFunnel([])).not.toThrow();
    expect(computeFunnel([]).conversion.shortlistToHire).toBe(0);
  });
});

describe("computeSourceOfHire", () => {
  it("returns nothing for no data", () => {
    expect(computeSourceOfHire([])).toEqual([]);
  });

  it("counts applicants and hires per source and converts", () => {
    const rows = computeSourceOfHire([
      { source: "referral", status: "hired" },
      { source: "referral", status: "applied" },
      { source: "job_board", status: "applied" },
      { source: "job_board", status: "applied" },
    ]);
    const referral = rows.find((r) => r.source === "referral");
    expect(referral).toMatchObject({ applicants: 2, hires: 1, conversion: 50 });
    expect(rows.find((r) => r.source === "job_board")?.conversion).toBe(0);
  });

  it("ranks by conversion so the best channel is visible first", () => {
    const rows = computeSourceOfHire([
      { source: "board", status: "applied" },
      { source: "board", status: "applied" },
      { source: "referral", status: "hired" },
    ]);
    expect(rows[0].source).toBe("referral");
  });

  it("labels a missing source rather than dropping the row", () => {
    const rows = computeSourceOfHire([{ source: null, status: "applied" }]);
    expect(rows[0].source).toBe("unknown");
  });
});

describe("computeRejectMix", () => {
  it("groups rejections by reason and gives each a share", () => {
    const mix = computeRejectMix([
      { rejection_reason: "compensation" },
      { rejection_reason: "compensation" },
      { rejection_reason: "location" },
      { rejection_reason: null },
    ]);
    expect(mix.total).toBe(4);
    expect(mix.rows.find((r) => r.reason === "compensation")).toMatchObject({
      count: 2,
      percent: 50,
    });
    expect(mix.rows.find((r) => r.reason === "unspecified")?.count).toBe(1);
  });

  it("reports coverage so a gap in reason capture is visible, not hidden", () => {
    const mix = computeRejectMix([
      { rejection_reason: "skills" },
      { rejection_reason: null },
      { rejection_reason: null },
    ]);
    // Only one of three rejections carries a reason.
    expect(mix.coveragePercent).toBe(33);
  });

  it("is empty and safe with no rejections", () => {
    const mix = computeRejectMix([]);
    expect(mix.rows).toEqual([]);
    expect(mix.coveragePercent).toBe(0);
  });
});

// ── Expanded metrics ────────────────────────────────────────────────────────
// Vendor critique: "difficult reporting" is the top complaint about incumbent
// ATSs. The bar here is that every number is derivable from stored data,
// drillable to a job, and honest about its own gaps.

import {
  computeTimeMetrics,
  computeJobTable,
  computeScoreBands,
  type TimingRow,
  type JobTableRow,
} from "@/lib/v2/analytics";

function timing(over: Partial<TimingRow> = {}): TimingRow {
  return {
    jobId: "job-1",
    jobTitle: "Backend Engineer",
    status: "applied",
    score: null,
    createdAt: "2026-07-01T00:00:00Z",
    decidedAt: null,
    ...over,
  };
}

describe("computeTimeMetrics", () => {
  it("takes the median days from application to decision", () => {
    const t = computeTimeMetrics([
      timing({ decidedAt: "2026-07-03T00:00:00Z" }),
      timing({ decidedAt: "2026-07-05T00:00:00Z" }),
      timing({ decidedAt: "2026-07-11T00:00:00Z" }),
    ]);
    expect(t.medianDaysToDecision).toBe(4);
    expect(t.decided).toBe(3);
  });

  it("ignores undecided applications rather than counting them as instant", () => {
    const t = computeTimeMetrics([
      timing({ decidedAt: "2026-07-03T00:00:00Z" }),
      timing({ decidedAt: null }),
    ]);
    expect(t.decided).toBe(1);
    expect(t.pending).toBe(1);
    expect(t.medianDaysToDecision).toBe(2);
  });

  it("counts the real backlog — waiting more than a week", () => {
    const now = Date.parse("2026-07-29T00:00:00Z");
    const t = computeTimeMetrics(
      [
        timing({ createdAt: "2026-07-01T00:00:00Z" }),
        timing({ createdAt: "2026-07-28T00:00:00Z" }),
      ],
      now,
    );
    expect(t.waitingOverAWeek).toBe(1);
  });

  it("reports null rather than zero when nothing has been decided", () => {
    expect(computeTimeMetrics([]).medianDaysToDecision).toBeNull();
    expect(computeTimeMetrics([timing()]).medianDaysToDecision).toBeNull();
  });

  it("ignores an unparseable or reversed date pair", () => {
    const t = computeTimeMetrics([
      timing({ createdAt: "nonsense", decidedAt: "2026-07-03T00:00:00Z" }),
      timing({ createdAt: "2026-07-10T00:00:00Z", decidedAt: "2026-07-01T00:00:00Z" }),
    ]);
    expect(t.decided).toBe(0);
  });
});

describe("computeJobTable", () => {
  const rows: JobTableRow[] = [];

  it("gives one row per job with its own numbers", () => {
    const out = computeJobTable([
      timing({ jobId: "a", jobTitle: "Backend", status: "hired", score: 80 }),
      timing({ jobId: "a", jobTitle: "Backend", status: "applied", score: 60 }),
      timing({ jobId: "b", jobTitle: "QA", status: "applied" }),
    ]);
    expect(out).toHaveLength(2);
    const backend = out.find((r) => r.jobId === "a");
    expect(backend?.applicants).toBe(2);
    expect(backend?.hired).toBe(1);
    expect(backend?.scored).toBe(2);
  });

  it("sorts by applicants so the busiest job leads", () => {
    const out = computeJobTable([
      timing({ jobId: "a", jobTitle: "A" }),
      timing({ jobId: "b", jobTitle: "B" }),
      timing({ jobId: "b", jobTitle: "B" }),
    ]);
    expect(out[0].jobId).toBe("b");
  });

  it("flags a job where nothing is scored — the silent-failure tell", () => {
    const out = computeJobTable([
      timing({ jobId: "a", jobTitle: "A", score: null }),
      timing({ jobId: "a", jobTitle: "A", score: null }),
    ]);
    expect(out[0].allUnscored).toBe(true);
  });

  it("does not flag a job that has at least one score", () => {
    const out = computeJobTable([
      timing({ jobId: "a", jobTitle: "A", score: 70 }),
      timing({ jobId: "a", jobTitle: "A", score: null }),
    ]);
    expect(out[0].allUnscored).toBe(false);
  });

  it("returns nothing for no data", () => {
    expect(computeJobTable(rows)).toEqual([]);
  });
});

describe("computeScoreBands", () => {
  it("buckets scores so the shape of the pipeline is visible", () => {
    const b = computeScoreBands([
      timing({ score: 92 }),
      timing({ score: 80 }),
      timing({ score: 66 }),
      timing({ score: 41 }),
    ]);
    expect(b.bands.map((x) => x.count)).toEqual([1, 1, 1, 1]);
    expect(b.scored).toBe(4);
  });

  it("counts unscored separately instead of hiding them in the lowest band", () => {
    const b = computeScoreBands([timing({ score: null }), timing({ score: 80 })]);
    expect(b.scored).toBe(1);
    expect(b.unscored).toBe(1);
  });

  it("is safe with nothing scored at all", () => {
    const b = computeScoreBands([timing({ score: null })]);
    expect(b.scored).toBe(0);
    expect(b.bands.every((x) => x.count === 0)).toBe(true);
  });
});
