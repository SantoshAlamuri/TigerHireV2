import { describe, expect, it } from "vitest";
import {
  dedupeNearDuplicateFlagLines,
  insightDuplicatesWhyVerdictBody,
  linesAreNearDuplicateFlagLines,
} from "@/components/dashboard/FitScoreReasoningPanel";

describe("linesAreNearDuplicateFlagLines", () => {
  it("detects experience requirement paraphrases", () => {
    const a =
      "Only 4 years of experience vs 5+ required; falls 1 year short of senior-level requirement";
    const b = "1 year short of 5+ years experience requirement (has 4 years)";
    expect(linesAreNearDuplicateFlagLines(a, b)).toBe(true);
  });

  it("detects JMeter / performance testing paraphrases", () => {
    const a =
      "No demonstrated experience with JMeter or performance testing tools; performance_testing score is 4/10";
    const b = "No demonstrated JMeter or performance testing experience";
    expect(linesAreNearDuplicateFlagLines(a, b)).toBe(true);
  });

  it("does not merge unrelated gaps", () => {
    expect(
      linesAreNearDuplicateFlagLines(
        "No demonstrated REST Assured experience for API contract validation",
        "Missing Jenkins pipeline ownership for release automation",
      ),
    ).toBe(false);
  });
});

describe("insightDuplicatesWhyVerdictBody", () => {
  const narrative =
    "CHENCHURAJU M is a Strong Hire with FitScore 86, ranking in the top 5% for test automation " +
    "and API testing expertise, demonstrated through expert-level Playwright/TypeScript proficiency.";

  it("detects identical insight vs why bodies", () => {
    expect(insightDuplicatesWhyVerdictBody(narrative, narrative)).toBe(true);
  });

  it("detects when one narrative is a substring of the other (long overlap)", () => {
    const shorter = narrative.slice(0, 180);
    expect(insightDuplicatesWhyVerdictBody(shorter, narrative)).toBe(true);
    expect(insightDuplicatesWhyVerdictBody(narrative, shorter)).toBe(true);
  });

  it("does not suppress unrelated short blurbs", () => {
    expect(insightDuplicatesWhyVerdictBody("Interview immediately.", narrative)).toBe(false);
  });
});

describe("dedupeNearDuplicateFlagLines", () => {
  it("keeps one line per near-duplicate cluster (prefers shorter retained first)", () => {
    const lines = [
      "Only 4 years of experience vs 5+ required; falls 1 year short of senior-level requirement",
      "1 year short of 5+ years experience requirement (has 4 years)",
      "No demonstrated experience with JMeter or performance testing tools; score 4/10",
      "No demonstrated JMeter or performance testing experience",
    ];
    const out = dedupeNearDuplicateFlagLines(lines, 10);
    expect(out).toHaveLength(2);
    expect(out.some((x) => x.includes("JMeter"))).toBe(true);
    expect(out.some((x) => x.includes("year") || x.includes("experience"))).toBe(true);
  });
});

describe("dedupeNearDuplicateFlagLines – priority order under cap", () => {
  it("keeps first-seen (high-priority) lines when the cap drops later ones", () => {
    const criticalRedFlag =
      "Critical: resume claims employment at two companies simultaneously for 18 months — possible fabrication that must be verified before any offer";
    const idealGaps = Array.from({ length: 14 }, (_, i) => `Missing tool ${i + 1}`);
    const out = dedupeNearDuplicateFlagLines([criticalRedFlag, ...idealGaps], 5);
    expect(out).toHaveLength(5);
    // The long critical red flag is first in input, so it must survive the cap
    expect(out[0]).toBe(criticalRedFlag);
  });

  it("does not re-sort survivors by length", () => {
    const lines = [
      "A much longer first line that should remain in the first position of the output",
      "Short line",
    ];
    const out = dedupeNearDuplicateFlagLines(lines, 10);
    expect(out[0]).toBe(lines[0]);
    expect(out[1]).toBe(lines[1]);
  });
});
