import { describe, it, expect } from "vitest";
import {
  daysOpen,
  offerAcceptRate,
  portfolioRows,
  portfolioSummary,
  tallyApplications,
  UNEVALUATED_SIGNALS,
  type PortfolioApplication,
  type PortfolioJob,
} from "@/lib/v2/ta-portfolio";

/**
 * Rows are built from counts now, not from a list of applications the client
 * happened to receive. `tallyApplications` is the same counting the portfolio
 * route runs server-side, so these cases still exercise the real rules.
 */
function rowsFor(jobs: PortfolioJob[], apps: PortfolioApplication[], now: number) {
  return portfolioRows(jobs, tallyApplications(jobs, apps), now);
}

const NOW = Date.parse("2026-08-01T00:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function job(over: Partial<PortfolioJob> = {}): PortfolioJob {
  return {
    id: "job-1",
    title: "Senior Backend Engineer",
    createdAt: daysAgo(34),
    ownerName: "Priya N.",
    rubricApproved: true,
    threshold: 78,
    ...over,
  };
}

function app(over: Partial<PortfolioApplication> = {}): PortfolioApplication {
  return { jobId: "job-1", status: "applied", score: 80, ...over };
}

describe("days open", () => {
  it("counts from the day the job opened", () => {
    expect(daysOpen(daysAgo(34), NOW)).toBe(34);
  });

  it("returns null rather than a number it cannot stand behind", () => {
    expect(daysOpen(null, NOW)).toBeNull();
    expect(daysOpen("not-a-date", NOW)).toBeNull();
    // A job dated in the future is corrupt data, not a job open for -5 days.
    expect(daysOpen(new Date(NOW + 5 * 86_400_000).toISOString(), NOW)).toBeNull();
  });
});

describe("portfolio rows", () => {
  it("names the blocker and its owner", () => {
    const [row] = rowsFor([job({ rubricApproved: false })], [app(), app()], NOW);
    expect(row.blocker.severity).toBe("critical");
    expect(row.blocker.label).toBe("No rubric approved — generic scoring");
    expect(row.owner).toBe("Priya N.");
    expect(row.daysOpen).toBe(34);
  });

  it("says unassigned rather than leaving a blocker with nobody on it", () => {
    const [row] = rowsFor([job({ ownerName: null })], [], NOW);
    expect(row.owner).toBe("unassigned");
  });

  it("counts only those at or above this job's threshold as clearing", () => {
    const apps = [app({ score: 80 }), app({ score: 60 }), app({ score: null })];
    const [row] = rowsFor([job()], apps, NOW);
    // One unscored applicant outranks the rest: a silent drop is never hidden.
    expect(row.blocker.label).toBe("Uploaded but not scored");
  });

  it("does not blame candidates for a rubric that has no threshold", () => {
    // With no bar to clear, "nobody clears the bar" would be a verdict on the
    // applicants for a gap in the rubric.
    const apps = Array.from({ length: 12 }, () => app({ score: 40 }));
    const [row] = rowsFor([job({ threshold: null })], apps, NOW);
    expect(row.blocker.label).not.toBe("Nobody clears the bar");
  });

  it("fires nobody-clears-the-bar when there is a real bar and nobody meets it", () => {
    const apps = Array.from({ length: 12 }, () => app({ score: 40 }));
    const [row] = rowsFor([job({ threshold: 78 })], apps, NOW);
    expect(row.blocker.label).toBe("Nobody clears the bar");
  });

  it("puts broken systems above slow humans, then the oldest job first", () => {
    const rows = rowsFor(
      [
        job({ id: "a", title: "A", rubricApproved: true, createdAt: daysAgo(10) }),
        job({ id: "b", title: "B", rubricApproved: false, createdAt: daysAgo(5) }),
        job({ id: "c", title: "C", rubricApproved: false, createdAt: daysAgo(60) }),
      ],
      [],
      NOW,
    );
    expect(rows.map((r) => r.jobTitle)).toEqual(["C", "B", "A"]);
  });

  it("names the signals it did not evaluate", () => {
    // A job shown as on track when nothing checked its offers is a false
    // all-clear, so the omission is stated rather than assumed harmless.
    expect(UNEVALUATED_SIGNALS).toContain("aging offers");
    expect(UNEVALUATED_SIGNALS).toContain("overdue scorecards");
  });
});

describe("applicant counts", () => {
  it("counts every applicant, not the first page of them", () => {
    // The bug this replaces: the page read /api/applications?limit=100 — a
    // route that hard-caps at 100 — and printed the length of what came back
    // as "47 waiting". Counting is now over the whole set.
    const apps = Array.from({ length: 250 }, (_, i) =>
      app({ status: i < 140 ? "applied" : "shortlisted", score: i < 60 ? null : 90 }),
    );
    const counts = tallyApplications([job()], apps).get("job-1")!;
    expect(counts.applicants).toBe(250);
    expect(counts.awaitingReview).toBe(140);
    expect(counts.unscored).toBe(60);
    expect(counts.clearingBar).toBe(190);
  });

  it("gives a job with no applicants zeroes rather than leaving it absent", () => {
    const counts = tallyApplications([job({ id: "empty" })], []);
    expect(counts.get("empty")).toEqual({
      applicants: 0,
      awaitingReview: 0,
      unscored: 0,
      clearingBar: 0,
    });
  });

  it("ignores applications belonging to a job outside the portfolio", () => {
    const counts = tallyApplications([job({ id: "a" })], [app({ jobId: "not-open" })]);
    expect(counts.get("a")!.applicants).toBe(0);
  });

  it("counts every scored applicant as clearing when the job has no bar", () => {
    const counts = tallyApplications(
      [job({ threshold: null })],
      [app({ score: 10 }), app({ score: 90 }), app({ score: null })],
    );
    expect(counts.get("job-1")!.clearingBar).toBe(2);
  });
});

describe("offer accept rate", () => {
  it("reports the rate over offers that were actually answered", () => {
    expect(offerAcceptRate({ accepted: 7, declined: 2, expired: 1 })).toEqual({
      pct: 70,
      decided: 10,
    });
  });

  it("returns null, not 0%, when no offer has been answered", () => {
    // A hardcoded em-dash used to sit here on every org forever. Null is the
    // honest version of that; 0% would be a different and much worse claim.
    expect(offerAcceptRate({ accepted: 0, declined: 0, expired: 0 })).toEqual({
      pct: null,
      decided: 0,
    });
  });

  it("counts an expired offer against acceptance, not out of the denominator", () => {
    expect(offerAcceptRate({ accepted: 1, declined: 0, expired: 1 }).pct).toBe(50);
  });
});

describe("portfolio summary", () => {
  const jobs = [
    job({ id: "a", createdAt: daysAgo(10), rubricApproved: true }),
    job({ id: "b", createdAt: daysAgo(34), rubricApproved: true }),
    job({ id: "c", createdAt: daysAgo(63), rubricApproved: false }),
  ];

  it("summarises openings, age and rubric coverage", () => {
    const rows = rowsFor(jobs, [], NOW);
    const s = portfolioSummary(jobs, rows, NOW);
    expect(s.openJobs).toBe(3);
    expect(s.medianDaysOpen).toBe(34);
    expect(s.rubricCoverage).toEqual({ withRubric: 2, total: 3, pct: 67 });
    expect(s.blocked).toBe(1);
  });

  it("returns null, not zero, when there is nothing to measure", () => {
    const s = portfolioSummary([], [], NOW);
    expect(s.medianDaysOpen).toBeNull();
    expect(s.rubricCoverage.pct).toBeNull();
    expect(s.openJobs).toBe(0);
  });

  it("ignores jobs with no usable open date rather than counting them as new", () => {
    const s = portfolioSummary(
      [job({ createdAt: null }), job({ createdAt: daysAgo(20) })],
      [],
      NOW,
    );
    expect(s.medianDaysOpen).toBe(20);
  });
});
