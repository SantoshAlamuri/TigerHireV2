/** Hybrid FitScore v2 caps, floors, models, and UI colors. */

import { getFitscoreHybridModel } from "@/lib/config/models";

/**
 * Extraction + JD-base generation model. Override via FITSCORE_HYBRID_MODEL env var.
 * Default: Claude Sonnet 4.6 (alias resolves to latest snapshot).
 */
export const HYBRID_EXTRACTION_MODEL = getFitscoreHybridModel();

export const HYBRID_EXPLANATION_MODEL =
  process.env.FITSCORE_HYBRID_EXPLANATION_MODEL ?? HYBRID_EXTRACTION_MODEL;

export const RED_FLAG_PENALTY_CAP = 20;

/**
 * Cert/impact/green bonuses combined may add at most this many points, and only when the
 * weighted dimension score alone is already ≥ BONUS_MIN_BASE_SCORE. Bonuses differentiate
 * good candidates — they must never rescue a weak one into "Good Fit".
 */
export const BONUS_TOTAL_CAP = 10;
export const BONUS_MIN_BASE_SCORE = 50;

export const DEFAULT_SCORE_FLOOR = 15;

export const DEFAULT_FIT_THRESHOLDS = {
  strong: 78,
  good: 60,
  moderate: 40,
  weak: 25,
} as const;

/** Fit label → accent color for callouts (spec section 4.2). */
export const FIT_LABEL_COLORS: Record<string, string> = {
  "Strong Fit": "#C6EFCE",
  "Good Fit": "#D6E8F7",
  "Moderate Fit": "#FFF2CC",
  "Weak Fit": "#FFE0B2",
  "Not a Fit": "#FFC7CE",
};

export const FEATURE_FLAG_HYBRID_V2 = "fitscore_hybrid_v2";

/** 25% skills + 75% intent primary score (replaces TriBlend on overall_score when enabled). */
export const FEATURE_FLAG_FITSCORE_BLEND_V2 = "fitscore_blend_v2";

/**
 * v5 "outcomes-weighted" scoring. Promotes quantified outcomes and behavioural competency from
 * capped additive bonuses (see BONUS_TOTAL_CAP) to first-class WEIGHTED dimensions, so the two
 * highest-validity signals differentiate candidates instead of saturating a +10 cap. Shadow-first:
 * when on, v5 is written to shadow_score/shadow_blend while v2 stays the live score.
 */
export const FEATURE_FLAG_FITSCORE_V5 = "fitscore_v5";

/** v5 quality-score weights — Skills 40 / Competency 30 / Outcomes 30. Must sum to 1. */
export const FITSCORE_V5_WEIGHTS = { skills: 0.4, competency: 0.3, outcomes: 0.3 } as const;

/**
 * Saturation counts: how many quantified-impact statements / behavioural (green-flag) signals map
 * to a full 100 on their dimension. Set above the old bonus-cap inflection points (impact 4,
 * green 6) so strong candidates spread across the range instead of all pinning at the cap.
 */
export const FITSCORE_V5_OUTCOMES_SATURATION = 8;
export const FITSCORE_V5_COMPETENCY_SATURATION = 8;

/** Cert evidence stays a small additive nudge in v5 (research: certifications are a minor signal). */
export const FITSCORE_V5_CERT_NUDGE_CAP = 5;

/**
 * When true, hybrid scoring uses one Haiku call for extraction + verdict narrative + evidence quotes.
 * Default off (unset). Enable on staging via `FF_MERGED_EXTRACTION_VERDICT=true`; leave unset in production until validated.
 */
export function isMergedExtractionVerdictEnabled(): boolean {
  return process.env.FF_MERGED_EXTRACTION_VERDICT === "true";
}

/** Single Sonnet call for merged extraction+verdict; retries disabled until validation-failure rate warrants it. */
export const MERGED_EXTRACTION_MAX_ATTEMPTS = 1;
