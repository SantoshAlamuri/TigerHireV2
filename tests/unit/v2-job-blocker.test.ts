import { describe, it, expect } from "vitest";
import { computeJobBlocker, type JobBlockerInput } from "@/lib/v2/job-blocker";

/**
 * The Jobs list is the v2 spine, and its whole value is that the blocker column
 * is COMPUTED, never typed. A Head of Talent must be able to read twelve jobs in
 * ten seconds and know which are stuck on the system, on a person, or on nobody.
 *
 * Vendor critique driving this: the top G2 complaint about incumbent ATSs is
 * "difficult reporting" — status that requires opening the job to understand is
 * the same failure in miniature.
 */
function input(over: Partial<JobBlockerInput> = {}): JobBlockerInput {
  return {
    daysOpen: 20,
    applicants: 100,
    rubricApproved: true,
    clearingBar: 20,
    unscored: 0,
    awaitingReview: 0,
    overdueScorecards: 0,
    offersAging: 0,
    ...over,
  };
}

describe("computeJobBlocker", () => {
  it("reports no blocker when the job is simply progressing", () => {
    const b = computeJobBlocker(input());
    expect(b.severity).toBe("ok");
    expect(b.label).toBe("On track");
  });

  it("treats a missing rubric as the most severe problem", () => {
    // The real production failure: 201 applicants scored on the generic path for
    // 63 days because nobody approved the rubric, and nothing said so.
    const b = computeJobBlocker(
      input({ rubricApproved: false, applicants: 201, daysOpen: 63, awaitingReview: 40 }),
    );
    expect(b.severity).toBe("critical");
    expect(b.label).toMatch(/rubric/i);
    expect(b.detail).toContain("201");
    expect(b.actionHref).toBe("scoring");
  });

  it("flags a bar nobody clears, which is a different disease from no rubric", () => {
    const b = computeJobBlocker(input({ applicants: 96, clearingBar: 0, daysOpen: 51 }));
    expect(b.severity).toBe("critical");
    expect(b.label).toMatch(/clears/i);
    expect(b.actionHref).toBe("scoring");
  });

  it("does not cry 'nobody clears' before enough applicants have been seen", () => {
    // Two applicants and neither clears is noise, not a signal.
    const b = computeJobBlocker(input({ applicants: 2, clearingBar: 0 }));
    expect(b.severity).not.toBe("critical");
  });

  it("names the human when a person is the bottleneck", () => {
    const b = computeJobBlocker(input({ overdueScorecards: 2 }));
    expect(b.severity).toBe("warning");
    expect(b.label).toMatch(/feedback/i);
    expect(b.detail).toContain("2");
  });

  it("surfaces an aging offer, because India loses hires at the offer stage", () => {
    const b = computeJobBlocker(input({ offersAging: 1 }));
    expect(b.severity).toBe("warning");
    expect(b.label).toMatch(/offer/i);
  });

  it("surfaces a review backlog", () => {
    const b = computeJobBlocker(input({ awaitingReview: 18 }));
    expect(b.severity).toBe("warning");
    expect(b.detail).toContain("18");
  });

  it("never hides unscored candidates — silent drops were a real production bug", () => {
    const b = computeJobBlocker(input({ unscored: 3 }));
    expect(b.severity).toBe("warning");
    expect(b.label).toMatch(/scored/i);
  });

  it("ranks a broken system above a slow human when both are true", () => {
    const b = computeJobBlocker(
      input({ rubricApproved: false, overdueScorecards: 5, offersAging: 2, applicants: 50 }),
    );
    expect(b.label).toMatch(/rubric/i);
  });

  it("prefers the offer risk over a review backlog, because offers expire", () => {
    const b = computeJobBlocker(input({ offersAging: 1, awaitingReview: 12 }));
    expect(b.label).toMatch(/offer/i);
  });

  it("marks a job aging past the India median even when nothing else is wrong", () => {
    const b = computeJobBlocker(input({ daysOpen: 60 }));
    expect(b.severity).toBe("warning");
    expect(b.label).toMatch(/aging/i);
  });

  it("is safe on a brand-new job with no data at all", () => {
    const b = computeJobBlocker(
      input({ daysOpen: 0, applicants: 0, clearingBar: 0, rubricApproved: false }),
    );
    expect(b.severity).toBe("critical");
    expect(() => computeJobBlocker(input({ applicants: 0, clearingBar: 0 }))).not.toThrow();
  });
});
