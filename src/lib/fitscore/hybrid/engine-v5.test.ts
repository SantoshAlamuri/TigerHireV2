import { describe, expect, it } from "vitest";
import { computeFitScoreV5 } from "./engine-v5";
import { computeHybridScore } from "./engine";
import { FITSCORE_V5_WEIGHTS } from "./constants";
import type { CandidateExtraction, ScoreBreakdown } from "./types";

const THRESHOLDS = { strong: 78, good: 60, moderate: 40, weak: 25 };

function extraction(over: Partial<CandidateExtraction> = {}): CandidateExtraction {
  return {
    candidate_name: "Test",
    total_years: 5,
    dimension_scores: {},
    certifications: [],
    quantified_impact: [],
    red_flags: [],
    green_flags: [],
    role_match_tag: "match",
    summary: "",
    ...over,
  };
}

function breakdown(over: Partial<ScoreBreakdown> = {}): ScoreBreakdown {
  return {
    rawDimScore: 60,
    certBonus: 0,
    impactBonus: 0,
    greenBonus: 0,
    redPenalty: 0,
    redPenaltyUncapped: 0,
    dimensions: {},
    formulaLines: [],
    ...over,
  };
}

/** Helper: strings to fill an array of length n. */
const items = (n: number): string[] => Array.from({ length: n }, (_, i) => `item-${i}`);

describe("computeFitScoreV5", () => {
  it("weights sum to 1 (skills 40 / competency 30 / outcomes 30)", () => {
    const total =
      FITSCORE_V5_WEIGHTS.skills + FITSCORE_V5_WEIGHTS.competency + FITSCORE_V5_WEIGHTS.outcomes;
    expect(total).toBeCloseTo(1, 10);
  });

  it("differentiates two equal-skill candidates on outcomes + competency — the core fix", () => {
    // Same skills (rawDimScore), but candidate A shows strong quantified impact + ownership
    // evidence while B shows little. v5 must separate them.
    const skills = breakdown({ rawDimScore: 70 });
    const strong = computeFitScoreV5(
      extraction({ quantified_impact: items(8), green_flags: items(8) }),
      skills,
      15,
      THRESHOLDS,
    );
    const weak = computeFitScoreV5(
      extraction({ quantified_impact: items(1), green_flags: items(1) }),
      skills,
      15,
      THRESHOLDS,
    );
    expect(strong.score).toBeGreaterThan(weak.score);
    // Meaningful gap, not a rounding wobble.
    expect(strong.score - weak.score).toBeGreaterThan(20);
  });

  it("does NOT compress the way v2 capped bonuses do", () => {
    // In v2, candidates with 4+ impacts and 6+ green flags both slam the BONUS_TOTAL_CAP (10),
    // so a 'very strong' and a 'merely strong' candidate collapse to the same bonus. v5 keeps them
    // apart because outcomes/competency scale continuously.
    const skills = breakdown({ rawDimScore: 65 });
    const v2Strong = computeHybridScore(
      { ...extraction({ quantified_impact: items(6), green_flags: items(8) }) },
      { skills: 100 },
      15,
      THRESHOLDS,
    );
    const v2Max = computeHybridScore(
      { ...extraction({ quantified_impact: items(12), green_flags: items(16) }) },
      { skills: 100 },
      15,
      THRESHOLDS,
    );
    // v2: bonus is capped, so the two collapse (difference is 0).
    expect(v2Max.breakdown.impactBonus + v2Max.breakdown.greenBonus).toBe(
      v2Strong.breakdown.impactBonus + v2Strong.breakdown.greenBonus,
    );
    // v5: still separated (12 impacts saturate; 6 do not).
    const v5Strong = computeFitScoreV5(
      extraction({ quantified_impact: items(4), green_flags: items(4) }),
      skills,
      15,
      THRESHOLDS,
    );
    const v5Max = computeFitScoreV5(
      extraction({ quantified_impact: items(8), green_flags: items(8) }),
      skills,
      15,
      THRESHOLDS,
    );
    expect(v5Max.score).toBeGreaterThan(v5Strong.score);
  });

  it("carries over the red-flag penalty and never rescues a red-flagged candidate", () => {
    const clean = computeFitScoreV5(
      extraction({ quantified_impact: items(8), green_flags: items(8) }),
      breakdown({ rawDimScore: 70, redPenalty: 0 }),
      15,
      THRESHOLDS,
    );
    const penalised = computeFitScoreV5(
      extraction({ quantified_impact: items(8), green_flags: items(8) }),
      breakdown({ rawDimScore: 70, redPenalty: 20 }),
      15,
      THRESHOLDS,
    );
    expect(penalised.score).toBe(clean.score - 20);
  });

  it("respects the score floor", () => {
    const res = computeFitScoreV5(
      extraction(),
      breakdown({ rawDimScore: 0, redPenalty: 20 }),
      15,
      THRESHOLDS,
    );
    expect(res.score).toBeGreaterThanOrEqual(15);
  });

  it("saturates each dimension at 100 and clamps the final score to 100", () => {
    const res = computeFitScoreV5(
      extraction({
        quantified_impact: items(50),
        green_flags: items(50),
        certifications: items(9),
      }),
      breakdown({ rawDimScore: 100 }),
      15,
      THRESHOLDS,
    );
    expect(res.blend.outcomes).toBe(100);
    expect(res.blend.competency).toBe(100);
    expect(res.score).toBeLessThanOrEqual(100);
  });

  it("emits an auditable blend with version and formula", () => {
    const res = computeFitScoreV5(
      extraction({ quantified_impact: items(4), green_flags: items(2) }),
      breakdown({ rawDimScore: 80 }),
      15,
      THRESHOLDS,
    );
    expect(res.blend.version).toBe("v5_outcomes");
    expect(res.blend.formula).toContain("skills(80)");
    expect(res.blend.skills).toBe(80);
    expect(res.blend.outcomes).toBe(50); // 4 / 8 saturation
    expect(res.blend.competency).toBe(25); // 2 / 8 saturation
  });
});
