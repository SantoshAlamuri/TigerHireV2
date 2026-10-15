/**
 * FitScore primary blend: 25% skills signal + 75% intent match.
 * Enabled via FF_FITSCORE_BLEND_V2 / feature flag fitscore_blend_v2.
 */

import type { ScoreBreakdown } from "./types";

export const FITSCORE_BLEND_V2_SKILLS_WEIGHT = 0.25;
export const FITSCORE_BLEND_V2_INTENT_WEIGHT = 0.75;

export interface FitScoreBlendV2Result {
  skillsSignal: number;
  intentMatch: number;
  primaryScore: number;
  primaryBlend: {
    version: "v2_25_75";
    skills_weight: number;
    intent_weight: number;
    skills_signal: number;
    intent_match: number;
    engine_fit_score: number;
    formula: string;
  };
}

/**
 * skills_signal — dimension-weighted extraction + certification evidence.
 * intent_match — narrative / responsibility alignment (impact, green flags, penalties on top of dimensions).
 */
export function computeFitScoreBlendV2(
  engineFitScore: number,
  breakdown: ScoreBreakdown,
): FitScoreBlendV2Result {
  const skillsSignal = Math.round(
    Math.min(100, Math.max(0, breakdown.rawDimScore + breakdown.certBonus)),
  );
  const intentMatch = Math.round(
    Math.min(
      100,
      Math.max(
        0,
        breakdown.rawDimScore + breakdown.impactBonus + breakdown.greenBonus - breakdown.redPenalty,
      ),
    ),
  );
  const primaryScore = Math.round(
    Math.min(
      100,
      Math.max(
        0,
        FITSCORE_BLEND_V2_SKILLS_WEIGHT * skillsSignal +
          FITSCORE_BLEND_V2_INTENT_WEIGHT * intentMatch,
      ),
    ),
  );
  return {
    skillsSignal,
    intentMatch,
    primaryScore,
    primaryBlend: {
      version: "v2_25_75",
      skills_weight: FITSCORE_BLEND_V2_SKILLS_WEIGHT,
      intent_weight: FITSCORE_BLEND_V2_INTENT_WEIGHT,
      skills_signal: skillsSignal,
      intent_match: intentMatch,
      engine_fit_score: engineFitScore,
      formula: `0.25×skills(${skillsSignal}) + 0.75×intent(${intentMatch})`,
    },
  };
}
