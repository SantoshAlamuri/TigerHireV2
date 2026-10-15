import { describe, it, expect } from "vitest";
import { talentMetrics, type MetricInput } from "@/lib/v2/ta-metrics";

/**
 * The standard talent-acquisition metric set the approved design calls for.
 *
 * Every one of these returns NULL rather than a number when it cannot be
 * computed. On preview today there are zero hires, zero offers and zero
 * screening sessions — so most of these have nothing to measure, and a
 * dashboard that answers "0 days" or "100%" in that situation is lying in a
 * way that gets believed and acted on.
 *
 * A metric with no data must say so.
 */
function input(over: Partial<MetricInput> = {}): MetricInput {
  return {
    applications: [],
    offers: [],
    openJobs: 0,
    recruiters: 0,
    screeningAnswered: 0,
    screeningSent: 0,
    spend: null,
    retained: null,
    hmRatings: [],
    ...over,
  };
}

const app = (over: Partial<MetricInput["applications"][number]> = {}) => ({
  status: "applied",
  createdAt: "2026-07-01T00:00:00Z",
  hiredAt: null as string | null,
  jobCreatedAt: "2026-06-01T00:00:00Z",
  source: null as string | null,
  ...over,
});

describe("talentMetrics — honesty when there is nothing to measure", () => {
  it("returns null for every rate metric on an empty org", () => {
    const m = talentMetrics(input());
    expect(m.timeToFill.value).toBeNull();
    expect(m.timeToHire.value).toBeNull();
    expect(m.offerAcceptance.value).toBeNull();
    expect(m.fillRate.value).toBeNull();
    expect(m.qualityOfHire.value).toBeNull();
  });

  it("explains WHY a metric is null, so the screen is not a row of dashes", () => {
    const m = talentMetrics(input());
    expect(m.timeToFill.note).toMatch(/no hires/i);
    expect(m.offerAcceptance.note).toMatch(/no offers/i);
  });

  it("never divides by zero into NaN or Infinity", () => {
    const m = talentMetrics(input({ openJobs: 0, recruiters: 0 }));
    for (const metric of Object.values(m)) {
      expect(Number.isNaN(metric.value as number)).toBe(false);
      expect(metric.value === Infinity).toBe(false);
    }
  });
});

describe("talentMetrics — real computations", () => {
  it("measures time to fill from the job opening to the hire", () => {
    const m = talentMetrics(
      input({
        applications: [
          app({
            status: "hired",
            jobCreatedAt: "2026-06-01T00:00:00Z",
            hiredAt: "2026-07-01T00:00:00Z",
          }),
        ],
      }),
    );
    expect(m.timeToFill.value).toBe(30);
  });

  it("measures time to hire from the application, which is a different clock", () => {
    const m = talentMetrics(
      input({
        applications: [
          app({
            status: "hired",
            createdAt: "2026-06-20T00:00:00Z",
            hiredAt: "2026-07-01T00:00:00Z",
          }),
        ],
      }),
    );
    expect(m.timeToHire.value).toBe(11);
    // The two clocks must not be conflated — a fast time-to-hire can still sit
    // inside a slow time-to-fill.
    expect(m.timeToHire.value).not.toBe(m.timeToFill.value);
  });

  it("takes the median, not the mean, so one outlier cannot flatter the number", () => {
    const hires = [10, 12, 400].map((d) =>
      app({
        status: "hired",
        createdAt: "2026-06-01T00:00:00Z",
        hiredAt: new Date(Date.parse("2026-06-01T00:00:00Z") + d * 86400000).toISOString(),
      }),
    );
    expect(talentMetrics(input({ applications: hires })).timeToHire.value).toBe(12);
  });

  it("computes offer acceptance from signed versus decided offers", () => {
    const m = talentMetrics(
      input({
        offers: [
          { signedAt: "2026-07-02T00:00:00Z", declinedAt: null },
          { signedAt: "2026-07-03T00:00:00Z", declinedAt: null },
          { signedAt: null, declinedAt: "2026-07-04T00:00:00Z" },
          // Still outstanding — excluded, because it has not been decided.
          { signedAt: null, declinedAt: null },
        ],
      }),
    );
    expect(m.offerAcceptance.value).toBe(67);
    expect(m.offerAcceptance.note).toMatch(/3 decided/i);
  });

  it("does not report acceptance when every offer is still outstanding", () => {
    const m = talentMetrics(input({ offers: [{ signedAt: null, declinedAt: null }] }));
    expect(m.offerAcceptance.value).toBeNull();
  });

  it("computes fill rate against open jobs", () => {
    const m = talentMetrics(
      input({ openJobs: 4, applications: [app({ status: "hired", hiredAt: "2026-07-01" })] }),
    );
    expect(m.fillRate.value).toBe(25);
  });

  it("computes reqs per recruiter, and flags an overloaded desk", () => {
    const ok = talentMetrics(input({ openJobs: 10, recruiters: 2 }));
    expect(ok.reqsPerRecruiter.value).toBe(5);
    const heavy = talentMetrics(input({ openJobs: 30, recruiters: 2 }));
    expect(heavy.reqsPerRecruiter.tone).toBe("warn");
  });

  it("computes the share screened automatically", () => {
    const m = talentMetrics(
      input({ applications: [app(), app(), app(), app()], screeningAnswered: 3 }),
    );
    expect(m.screenedAutomatically.value).toBe(75);
  });

  it("caps a share at 100 rather than reporting an impossible percentage", () => {
    const m = talentMetrics(input({ applications: [app()], screeningAnswered: 5 }));
    expect(m.screenedAutomatically.value).toBe(100);
  });

  it("ignores unparseable dates instead of producing a negative duration", () => {
    const m = talentMetrics(
      input({
        applications: [app({ status: "hired", createdAt: "nonsense", hiredAt: "also bad" })],
      }),
    );
    expect(m.timeToHire.value).toBeNull();
  });

  it("never reports a negative duration when dates are reversed", () => {
    const m = talentMetrics(
      input({
        applications: [
          app({
            status: "hired",
            createdAt: "2026-07-10T00:00:00Z",
            hiredAt: "2026-07-01T00:00:00Z",
          }),
        ],
      }),
    );
    expect(m.timeToHire.value).toBeNull();
  });
});

describe("talentMetrics — the remaining standard metrics", () => {
  it("refuses a cost per hire when there are no hires to divide by", () => {
    const m = talentMetrics(input({ spend: 500000 }));
    expect(m.costPerHire.value).toBeNull();
    expect(m.costPerHire.note).toMatch(/nothing to divide/i);
  });

  it("computes cost per hire once there are hires", () => {
    const m = talentMetrics(
      input({ spend: 500000, applications: [app({ status: "hired", hiredAt: "2026-07-01" })] }),
    );
    expect(m.costPerHire.value).toBe(500000);
  });

  it("says spend is untracked rather than implying it is zero", () => {
    expect(talentMetrics(input()).costPerHire.note).toMatch(/not tracked/i);
  });

  it("computes candidate reply rate from messages sent", () => {
    const m = talentMetrics(input({ screeningSent: 10, screeningAnswered: 6 }));
    expect(m.candidateReplyRate.value).toBe(60);
  });

  it("does not report a reply rate when nothing was sent", () => {
    expect(talentMetrics(input()).candidateReplyRate.value).toBeNull();
  });

  it("computes 90-day retention against hires", () => {
    const hires = [1, 2, 3, 4].map(() => app({ status: "hired", hiredAt: "2026-04-01" }));
    expect(talentMetrics(input({ applications: hires, retained: 3 })).retention90.value).toBe(75);
  });

  it("averages HM satisfaction, and stays null with no responses", () => {
    expect(talentMetrics(input({ hmRatings: [4, 5, 3] })).hmSatisfaction.value).toBe(4);
    expect(talentMetrics(input()).hmSatisfaction.value).toBeNull();
  });

  it("withholds FitScore validity below a sample that could mean anything", () => {
    const few = [1, 2].map(() => app({ status: "hired", hiredAt: "2026-04-01" }));
    const m = talentMetrics(input({ applications: few }));
    expect(m.fitScoreValidity.value).toBeNull();
    expect(m.fitScoreValidity.note).toMatch(/at least 10 hires/i);
  });
});
