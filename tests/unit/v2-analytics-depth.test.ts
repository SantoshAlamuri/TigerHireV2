import { describe, it, expect } from "vitest";
import { applicationsPerWeek, stageVelocity, type VelRow } from "@/lib/v2/analytics-trends";
import { jobDiagnostics, passThrough, qualityChecks } from "@/lib/v2/analytics-diagnostics";

/**
 * The Trends, By-job and Quality views the approved design calls for.
 *
 * The hard rule here is the same one that governs the metric tiles: where the
 * schema cannot answer a question, the answer is null with a reason. Two of
 * these views are especially tempting to fake — a "benchmark" column invites an
 * invented industry number, and a per-stage velocity table invites made-up
 * stage durations when the database records no stage history at all. Both would
 * be quoted in a hiring review as if they were measurements.
 */
const day = 86_400_000;
const at = (iso: string) => iso;

describe("applicationsPerWeek", () => {
  it("buckets applications into consecutive weeks ending at the reference date", () => {
    const now = Date.parse("2026-07-29T00:00:00Z");
    const rows = [
      { createdAt: new Date(now - 2 * day).toISOString() },
      { createdAt: new Date(now - 3 * day).toISOString() },
      { createdAt: new Date(now - 10 * day).toISOString() },
    ];
    const weeks = applicationsPerWeek(rows, 3, now);
    expect(weeks).toHaveLength(3);
    expect(weeks[weeks.length - 1].count).toBe(2);
    expect(weeks[weeks.length - 2].count).toBe(1);
  });

  it("returns empty buckets rather than omitting quiet weeks", () => {
    const now = Date.parse("2026-07-29T00:00:00Z");
    const weeks = applicationsPerWeek([], 4, now);
    expect(weeks).toHaveLength(4);
    expect(weeks.every((w) => w.count === 0)).toBe(true);
  });

  it("ignores unparseable dates instead of bucketing them at the epoch", () => {
    const now = Date.parse("2026-07-29T00:00:00Z");
    const weeks = applicationsPerWeek([{ createdAt: "nonsense" }, { createdAt: null }], 2, now);
    expect(weeks.every((w) => w.count === 0)).toBe(true);
  });
});

describe("stageVelocity — refuses to invent stage durations", () => {
  const rows: VelRow[] = [
    {
      status: "hired",
      createdAt: at("2026-05-01T00:00:00Z"),
      decidedAt: at("2026-05-21T00:00:00Z"),
    },
    {
      status: "rejected",
      createdAt: at("2026-05-01T00:00:00Z"),
      decidedAt: at("2026-05-11T00:00:00Z"),
    },
  ];

  it("measures the clocks the schema actually records", () => {
    const v = stageVelocity(rows, Date.parse("2026-07-29T00:00:00Z"));
    const decision = v.find((r) => r.stage === "Applied → Decision");
    expect(decision?.now).toBe(15);
  });

  it("returns null with a reason for stages the schema does not timestamp", () => {
    const v = stageVelocity(rows, Date.parse("2026-07-29T00:00:00Z"));
    const screen = v.find((r) => r.stage === "Screened → Interview");
    expect(screen?.now).toBeNull();
    expect(screen?.driver).toMatch(/not recorded/i);
  });

  it("never invents a prior-quarter figure when there is no prior-quarter data", () => {
    const v = stageVelocity(rows, Date.parse("2026-07-29T00:00:00Z"));
    for (const r of v) if (r.prior === null) expect(r.driver).not.toMatch(/faster|slower/i);
  });

  it("names the direction only when both quarters have data", () => {
    const now = Date.parse("2026-07-29T00:00:00Z");
    const mixed: VelRow[] = [
      // Previous quarter: slow.
      { status: "hired", createdAt: "2026-02-01T00:00:00Z", decidedAt: "2026-03-15T00:00:00Z" },
      // Current quarter: fast.
      { status: "hired", createdAt: "2026-07-01T00:00:00Z", decidedAt: "2026-07-06T00:00:00Z" },
    ];
    const d = stageVelocity(mixed, now).find((r) => r.stage === "Applied → Decision");
    expect(d?.now).toBe(5);
    expect(d?.prior).toBe(42);
    expect(d?.driver).toMatch(/faster/i);
  });
});

describe("passThrough — benchmarks against your own jobs, never an invented industry figure", () => {
  const rows = [
    { jobId: "a", status: "hired" },
    { jobId: "a", status: "shortlisted" },
    { jobId: "a", status: "applied" },
    { jobId: "a", status: "rejected" },
    { jobId: "b", status: "applied" },
    { jobId: "b", status: "shortlisted" },
  ];

  it("labels the comparison as the org's own median, not an industry standard", () => {
    for (const r of passThrough(rows)) {
      expect(r.benchmarkLabel).toMatch(/your|across your jobs/i);
      expect(r.benchmarkLabel).not.toMatch(/industry|market average/i);
    }
  });

  it("computes each stage share against applicants", () => {
    const applyToShortlist = passThrough(rows).find((r) => r.stage.includes("Shortlist"));
    expect(applyToShortlist?.yours).toBe(50);
  });

  it("reads the number for the recruiter rather than leaving it bare", () => {
    for (const r of passThrough(rows)) expect(r.read.length).toBeGreaterThan(3);
  });

  it("returns nothing rather than 0% when there are no applications", () => {
    expect(passThrough([]).every((r) => r.yours === null)).toBe(true);
  });
});

describe("jobDiagnostics", () => {
  const now = Date.parse("2026-07-29T00:00:00Z");
  const base = {
    jobId: "j1",
    jobTitle: "Backend Engineer",
    jobCreatedAt: "2026-06-29T00:00:00Z",
    status: "applied",
    source: "referral",
    hasRubric: true as boolean | null,
  };

  it("counts days open from the job's own creation date", () => {
    const d = jobDiagnostics([base], now)[0];
    expect(d.daysOpen).toBe(30);
  });

  it("says the rubric is unchecked rather than claiming it is missing", () => {
    const d = jobDiagnostics([{ ...base, hasRubric: null }], now)[0];
    expect(d.clearRubric).toBeNull();
  });

  it("names the best source by hires, falling back to volume", () => {
    const rows = [
      { ...base, source: "naukri", status: "applied" },
      { ...base, source: "naukri", status: "applied" },
      { ...base, source: "referral", status: "hired" },
    ];
    expect(jobDiagnostics(rows, now)[0].bestSource).toBe("referral");
  });

  it("diagnoses a job with applicants but no movement", () => {
    const stuck = Array.from({ length: 20 }, () => ({ ...base, status: "applied" }));
    expect(jobDiagnostics(stuck, now)[0].diagnosis).toMatch(
      /nobody has reviewed|not been reviewed/i,
    );
  });

  it("diagnoses a starved job separately from a stuck one", () => {
    const d = jobDiagnostics([{ ...base, jobCreatedAt: "2026-05-01T00:00:00Z" }], now)[0];
    expect(d.diagnosis).toMatch(/too few applicants|sourcing/i);
  });

  it("does not diagnose a job that is too new to judge", () => {
    const fresh = jobDiagnostics([{ ...base, jobCreatedAt: "2026-07-27T00:00:00Z" }], now)[0];
    expect(fresh.diagnosis).toMatch(/too new/i);
  });
});

describe("qualityChecks", () => {
  it("reports each check as pass, fail or unknown — never a silent pass", () => {
    const checks = qualityChecks({
      hires: 0,
      scoredHires: 0,
      pulseResponses: 0,
      rubricJobs: 0,
      totalJobs: 3,
    });
    expect(checks.length).toBeGreaterThan(2);
    for (const c of checks) expect(["pass", "fail", "unknown"]).toContain(c.status);
  });

  it("marks a check unknown, with a detail saying why, when there is no data", () => {
    const checks = qualityChecks({
      hires: 0,
      scoredHires: 0,
      pulseResponses: 0,
      rubricJobs: 0,
      totalJobs: 0,
    });
    const unknown = checks.filter((c) => c.status === "unknown");
    expect(unknown.length).toBeGreaterThan(0);
    for (const c of unknown) expect(c.detail.length).toBeGreaterThan(5);
  });

  it("distinguishes an unfetched rubric state from an empty org and from a real gap", () => {
    const label = /rubric/i;
    // No jobs at all.
    const empty = qualityChecks({
      hires: 0,
      scoredHires: 0,
      pulseResponses: 0,
      rubricJobs: null,
      totalJobs: 0,
    }).find((c) => c.check.match(label));
    expect(empty?.detail).toMatch(/no jobs/i);

    // Jobs exist, rubric state was never fetched — must not read as "no jobs",
    // and must not accuse every job of missing a rubric.
    const unchecked = qualityChecks({
      hires: 0,
      scoredHires: 0,
      pulseResponses: 0,
      rubricJobs: null,
      totalJobs: 14,
    }).find((c) => c.check.match(label));
    expect(unchecked?.status).toBe("unknown");
    expect(unchecked?.detail).toMatch(/not exposed/i);
    expect(unchecked?.detail).not.toMatch(/no jobs/i);
    expect(unchecked?.detail).toContain("14");
  });

  it("passes the rubric-coverage check only when every job has one", () => {
    expect(
      qualityChecks({
        hires: 2,
        scoredHires: 2,
        pulseResponses: 1,
        rubricJobs: 3,
        totalJobs: 3,
      }).find((c) => c.check.match(/rubric/i))?.status,
    ).toBe("pass");
    expect(
      qualityChecks({
        hires: 2,
        scoredHires: 2,
        pulseResponses: 1,
        rubricJobs: 1,
        totalJobs: 3,
      }).find((c) => c.check.match(/rubric/i))?.status,
    ).toBe("fail");
  });
});
