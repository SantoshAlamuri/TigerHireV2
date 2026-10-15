import { describe, expect, it } from "vitest";
import { computeFitScoreBlendV2 } from "@/lib/fitscore/hybrid/blend-v2";
import type { ScoreBreakdown } from "@/lib/fitscore/hybrid/types";

describe("computeFitScoreBlendV2", () => {
  const breakdown: ScoreBreakdown = {
    rawDimScore: 60,
    certBonus: 5,
    impactBonus: 8,
    greenBonus: 6,
    redPenalty: 2,
    redPenaltyUncapped: 2,
    dimensions: {},
    formulaLines: [],
  };

  it("applies 25/75 skills vs intent blend", () => {
    const result = computeFitScoreBlendV2(72, breakdown);
    expect(result.skillsSignal).toBe(65);
    expect(result.intentMatch).toBe(72);
    expect(result.primaryScore).toBe(Math.round(0.25 * 65 + 0.75 * 72));
  });
});
