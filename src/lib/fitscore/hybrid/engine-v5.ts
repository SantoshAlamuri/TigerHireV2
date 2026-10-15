/**
 * FitScore v5 — "outcomes-weighted" engine.
 *
 * Structural change from v2 (see engine.ts): the v2 engine scores role-skill dimensions and then
 * adds quantified impact + behavioural (green-flag) evidence as small ADDITIVE BONUSES, capped in
 * aggregate at BONUS_TOTAL_CAP (10 points). On strong pools nearly every candidate hits that cap,
 * so the two highest-validity signals — demonstrated outcomes and evidenced competency — stop
 * differentiating candidates. v5 promotes them to first-class WEIGHTED dimensions with full range:
 *
 *   quality = 0.40·skills + 0.30·competency + 0.30·outcomes
 *   score   = clamp(floor, 100, round(quality + certNudge − redPenalty))
 *
 * Inputs are the SAME CandidateExtraction the v2 engine already produces (no new extraction):
 *   skills      ← the v2 weighted-dimension score (breakdown.rawDimScore)
 *   outcomes    ← quantified_impact[] count, saturating at FITSCORE_V5_OUTCOMES_SATURATION
 *   competency  ← green_flags[] count, saturating at FITSCORE_V5_COMPETENCY_SATURATION
 *                 (v5.0 proxy for behavioural competency; upgrade to leveled competencies in v5.1)
 *
 * Red-flag penalty and score floor are carried over from the v2 breakdown unchanged, so v5 can
 * never rescue a red-flagged or sub-floor candidate.
 */

import {
  FITSCORE_V5_WEIGHTS,
  FITSCORE_V5_OUTCOMES_SATURATION,
  FITSCORE_V5_COMPETENCY_SATURATION,
  FITSCORE_V5_CERT_NUDGE_CAP,
} from "./constants";
import { fitLabelForScore } from "./engine";
import type { CandidateExtraction, FitScoreV5Blend, FitThresholds, ScoreBreakdown } from "./types";

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** count → 0..100, linear up to `saturation`, flat after. */
function saturatingScore(count: number, saturation: number): number {
  if (saturation <= 0) return 0;
  return clamp((count / saturation) * 100, 0, 100);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface FitScoreV5Result {
  score: number;
  label: string;
  blend: FitScoreV5Blend;
}

/**
 * Compute the v5 outcomes-weighted score from the v2 breakdown + extraction. `breakdown` supplies
 * the already-computed rawDimScore (skills) and redPenalty, so v5 and v2 stay consistent on the
 * inputs they share.
 */
export function computeFitScoreV5(
  extraction: CandidateExtraction,
  breakdown: ScoreBreakdown,
  scoreFloor: number,
  fitThresholds: FitThresholds,
): FitScoreV5Result {
  const skills = clamp(breakdown.rawDimScore, 0, 100);

  const impactCount = Array.isArray(extraction.quantified_impact)
    ? extraction.quantified_impact.length
    : 0;
  const outcomes = saturatingScore(impactCount, FITSCORE_V5_OUTCOMES_SATURATION);

  const greenCount = Array.isArray(extraction.green_flags) ? extraction.green_flags.length : 0;
  const competency = saturatingScore(greenCount, FITSCORE_V5_COMPETENCY_SATURATION);

  const quality =
    FITSCORE_V5_WEIGHTS.skills * skills +
    FITSCORE_V5_WEIGHTS.competency * competency +
    FITSCORE_V5_WEIGHTS.outcomes * outcomes;

  const certCount = Array.isArray(extraction.certifications) ? extraction.certifications.length : 0;
  const certNudge = Math.min(certCount * 1.5, FITSCORE_V5_CERT_NUDGE_CAP);

  const redPenalty = Number.isFinite(breakdown.redPenalty) ? breakdown.redPenalty : 0;
  const floor = Number.isFinite(scoreFloor) ? scoreFloor : 15;

  const raw = quality + certNudge - redPenalty;
  const score = Math.round(clamp(raw, floor, 100));
  const label = fitLabelForScore(score, fitThresholds);

  const s = Math.round(skills);
  const c = Math.round(competency);
  const o = Math.round(outcomes);

  return {
    score,
    label,
    blend: {
      version: "v5_outcomes",
      weights: {
        skills: FITSCORE_V5_WEIGHTS.skills,
        competency: FITSCORE_V5_WEIGHTS.competency,
        outcomes: FITSCORE_V5_WEIGHTS.outcomes,
      },
      skills: s,
      competency: c,
      outcomes: o,
      quality: Math.round(quality),
      cert_nudge: round1(certNudge),
      red_penalty: round1(redPenalty),
      formula: `0.40×skills(${s}) + 0.30×competency(${c}) + 0.30×outcomes(${o}) + cert(${round1(
        certNudge,
      )}) − red(${round1(redPenalty)})`,
    },
  };
}
