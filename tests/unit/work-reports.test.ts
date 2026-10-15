import { describe, expect, it } from "vitest";
import { barWidth, buildReport, sourceName } from "@/lib/work/reports";
import type { RollupRow } from "@/lib/v2/analytics-rollup";

const row = (o: Partial<RollupRow>): RollupRow => ({
  jobId: "j1",
  status: "applied",
  source: "linkedin",
  rejectionReason: null,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-03T00:00:00Z",
  offerAcceptedAt: null,
  score: 80,
  screened: false,
  ...o,
});

describe("reports", () => {
  const rows = [
    row({}),
    row({ status: "shortlisted" }),
    row({ status: "hired", source: "referral" }),
    row({ status: "rejected", rejectionReason: "location", score: null }),
    row({ jobId: "j2", status: "applied", screened: true }),
  ];
  const r = buildReport(rows, {
    j1: { title: "QA", createdAt: null },
    j2: { title: "BE", createdAt: null },
  });

  it("counts the funnel from the same rows as analytics", () => {
    expect(r.applications).toBe(5);
    expect(r.funnel.hired).toBe(1);
    expect(r.screened).toBe(1);
  });

  it("shows how many are still waiting in each job, biggest job first", () => {
    expect(r.jobs.map((j) => [j.jobTitle, j.applicants, j.waiting])).toEqual([
      ["QA", 4, 1],
      ["BE", 1, 1],
    ]);
  });

  it("names reasons and sources in plain words", () => {
    expect(r.rejects[0].label).toBe("Location / relocation");
    expect(sourceName("careers_page")).toBe("Careers page");
    expect(sourceName("job_fair")).toBe("Job fair");
  });

  it("never draws a real count as an empty bar", () => {
    expect(barWidth(1, 1000)).toBe("2%");
    expect(barWidth(0, 10)).toBe("0%");
  });
});
