import { describe, expect, it } from "vitest";
import type { FitScore } from "@/types";
import {
  displayedFitScore,
  hasMarketPool,
  icpCoverageFromScore,
  marketAndConfidenceContextLine,
  mustHaveCountFromScore,
} from "@/components/dashboard/fit-score-display-helpers";

function baseScore(overrides: Partial<FitScore> = {}): FitScore {
  return {
    id: "score-1",
    candidateId: "cand-1",
    candidateName: "Alex",
    jobId: "job-1",
    jobTitle: "Engineer",
    companyName: "Acme",
    overallScore: 72,
    rating: "Good",
    dimensions: {},
    greenFlags: [],
    amberFlags: [],
    redFlags: [],
    aiSummary: "",
    modelVersion: "v2",
    promptVersion: "v2",
    scoredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("hasMarketPool", () => {
  it("returns true when market percentile exists", () => {
    expect(hasMarketPool(baseScore({ marketPercentile: 88 }))).toBe(true);
  });

  it("returns false when only building label exists", () => {
    expect(hasMarketPool(baseScore({ marketLabel: "Building pool…" }))).toBe(false);
  });
});

describe("marketAndConfidenceContextLine", () => {
  it("omits line when pool is still building", () => {
    expect(marketAndConfidenceContextLine(baseScore())).toBeNull();
  });

  it("combines market rank and confidence when pool exists", () => {
    const line = marketAndConfidenceContextLine(
      baseScore({ marketPercentile: 90, evidenceConfidenceScore: 0.82 }),
    );
    expect(line).toMatch(/^Top \d+% · 0\.82 confidence$/);
  });
});

describe("icpCoverageFromScore", () => {
  it("reads must-have count from rubric snapshot", () => {
    const score = baseScore({
      rubricSnapshot: {
        ideal_candidate_profile: {
          must_haves: ["A", "B", "C", "D", "E", "F", "G"],
        },
      },
      idealMatchPct: 71,
      idealGaps: ["gap one", "gap two"],
    });
    expect(mustHaveCountFromScore(score)).toBe(7);
    const coverage = icpCoverageFromScore(score);
    expect(coverage?.label).toBe("Meets 5 of 7 must-haves");
    expect(coverage?.gaps).toEqual(["gap one", "gap two"]);
  });

  it("falls back to pct-only label when must-have count is unavailable", () => {
    const coverage = icpCoverageFromScore(baseScore({ idealMatchPct: 64 }));
    expect(coverage?.label).toBe("64% ICP match");
  });
});

describe("displayedFitScore", () => {
  it("uses persisted overallScore even when primaryScore is present (blend selection must win)", () => {
    const score = baseScore({ overallScore: 61, primaryScore: 82, shadowScore: 61 });
    expect(displayedFitScore(score)).toBe(61);
  });

  it("falls back to primaryScore when overallScore is zero (legacy partial row)", () => {
    const score = baseScore({ overallScore: 0, primaryScore: 82 });
    expect(displayedFitScore(score)).toBe(82);
  });

  it("returns overallScore when no primaryScore exists", () => {
    const score = baseScore({ overallScore: 72 });
    expect(displayedFitScore(score)).toBe(72);
  });
});
