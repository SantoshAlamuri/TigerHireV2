import { describe, it, expect } from "vitest";
import { buildCandidateSummary, scoreLabel, type SummaryInput } from "@/lib/v2/candidate-summary";

/**
 * A candidate row has to say something useful without being opened. A name and
 * a status is not a row — it is a placeholder.
 *
 * The other rule: when a score is missing, say WHY. A bare dash reads as
 * "nothing here"; "not scored yet" is a fact the recruiter can act on, and the
 * usual cause is an unapproved rubric.
 */
function input(over: Partial<SummaryInput> = {}): SummaryInput {
  return { ...over };
}

describe("buildCandidateSummary", () => {
  it("returns an empty list when nothing is known, rather than filler", () => {
    expect(buildCandidateSummary(input()).parts).toEqual([]);
  });

  it("leads with experience, which is what a recruiter scans first", () => {
    const s = buildCandidateSummary(input({ experienceYears: 6.2, location: "Bangalore" }));
    expect(s.parts[0]).toBe("6.2 yrs");
  });

  it("renders whole years without a needless decimal", () => {
    expect(buildCandidateSummary(input({ experienceYears: 5 })).parts[0]).toBe("5 yrs");
    expect(buildCandidateSummary(input({ experienceYears: 1 })).parts[0]).toBe("1 yr");
  });

  it("includes location when known", () => {
    expect(buildCandidateSummary(input({ location: "Pune" })).parts).toContain("Pune");
  });

  it("shows notice period, because it decides who can actually start", () => {
    expect(buildCandidateSummary(input({ noticePeriodDays: 30 })).parts).toContain("30d notice");
    expect(buildCandidateSummary(input({ noticePeriodDays: 0 })).parts).toContain("immediate");
  });

  it("shows expected CTC in lakhs, the unit Indian recruiters use", () => {
    expect(buildCandidateSummary(input({ expectedCtcLpa: 38 })).parts).toContain("₹38L expected");
  });

  it("flags competing offers, which is a timing risk", () => {
    expect(buildCandidateSummary(input({ offersInHand: 2 })).parts).toContain("2 offers in hand");
    expect(buildCandidateSummary(input({ offersInHand: 0 })).parts).not.toContain(
      "0 offers in hand",
    );
  });

  it("skips blank, zero-ish and unknown values instead of printing junk", () => {
    const s = buildCandidateSummary(
      input({ location: "   ", experienceYears: null, expectedCtcLpa: null }),
    );
    expect(s.parts).toEqual([]);
  });

  it("caps skills so one verbose CV cannot blow out the row", () => {
    const s = buildCandidateSummary(
      input({ skills: ["Java", "Selenium", "TestNG", "Cypress", "Playwright", "JMeter"] }),
    );
    expect(s.skills).toEqual(["Java", "Selenium", "TestNG"]);
    expect(s.moreSkills).toBe(3);
  });

  it("reports no overflow when the skills fit", () => {
    const s = buildCandidateSummary(input({ skills: ["Java", "Selenium"] }));
    expect(s.skills).toEqual(["Java", "Selenium"]);
    expect(s.moreSkills).toBe(0);
  });

  it("ignores empty skill entries", () => {
    const s = buildCandidateSummary(input({ skills: ["Java", "  ", ""] }));
    expect(s.skills).toEqual(["Java"]);
  });

  it("formats the applied date as an age, which is what staleness means", () => {
    const now = new Date("2026-07-29T12:00:00Z").getTime();
    const twoDaysAgo = new Date("2026-07-27T12:00:00Z").toISOString();
    expect(buildCandidateSummary(input({ appliedAt: twoDaysAgo }), now).parts).toContain("2d ago");
    const today = new Date("2026-07-29T09:00:00Z").toISOString();
    expect(buildCandidateSummary(input({ appliedAt: today }), now).parts).toContain("today");
  });

  it("survives an unparseable date rather than printing NaN", () => {
    expect(buildCandidateSummary(input({ appliedAt: "not-a-date" })).parts).toEqual([]);
  });
});

describe("scoreLabel", () => {
  it("shows the number when it exists", () => {
    expect(scoreLabel(79, true)).toEqual({ text: "79", muted: false });
  });

  it("explains a missing score instead of showing a bare dash", () => {
    expect(scoreLabel(null, true)).toEqual({ text: "not scored yet", muted: true });
  });

  it("names the usual cause when the job has no approved rubric", () => {
    expect(scoreLabel(null, false)).toEqual({ text: "no rubric approved", muted: true });
  });

  it("still shows a real score even if the rubric was approved later", () => {
    expect(scoreLabel(64, false)).toEqual({ text: "64", muted: false });
  });

  it("treats zero as no score, since the pipeline stores 0 for unscored", () => {
    expect(scoreLabel(0, true).muted).toBe(true);
  });
});
