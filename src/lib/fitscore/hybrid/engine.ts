/**
 * Deterministic hybrid FitScore engine — works with any dimension set.
 * Dimensions come from the JD Base weights; extraction must provide matching scores.
 */

import {
  RED_FLAG_PENALTY_CAP,
  FIT_LABEL_COLORS,
  BONUS_TOTAL_CAP,
  BONUS_MIN_BASE_SCORE,
} from "./constants";
import type { FitThresholds, CandidateExtraction, ScoringWeights, ScoreBreakdown } from "./types";

function clampDim(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(10, Math.max(1, n));
}

function redPenaltyForFlag(severity: string): number {
  switch (severity) {
    case "critical":
      return 5;
    case "moderate":
      return 2;
    case "minor":
      return 0.5;
    default:
      return 2;
  }
}

export function fitLabelForScore(score: number, t: FitThresholds): string {
  if (score >= t.strong) return "Strong Fit";
  if (score >= t.good) return "Good Fit";
  if (score >= t.moderate) return "Moderate Fit";
  if (score >= t.weak) return "Weak Fit";
  return "Not a Fit";
}

export function computeHybridScore(
  extraction: CandidateExtraction,
  weights: ScoringWeights,
  scoreFloor: number,
  fitThresholds: FitThresholds,
): { fitScore: number; fitLabel: string; fitLabelColor: string; breakdown: ScoreBreakdown } {
  const dimKeys = Object.keys(weights).filter(
    (k) => typeof weights[k] === "number" && weights[k] > 0,
  );
  const dimWeightTotal = dimKeys.reduce((s, k) => s + weights[k], 0);

  const dimensions: ScoreBreakdown["dimensions"] = {};
  let rawDimScore = 0;
  const formulaLines: string[] = [];

  if (dimWeightTotal <= 0) {
    rawDimScore = 0;
  } else {
    for (const key of dimKeys) {
      const w = weights[key];
      const v = clampDim(extraction.dimension_scores?.[key] ?? 1);
      const contribution = (v / 10) * (w / dimWeightTotal) * 100;
      dimensions[key] = { value: v, weight: w, contribution };
      rawDimScore += contribution;
      formulaLines.push(
        `${key}: (${v}/10)×(${w}/${dimWeightTotal})×100 = ${contribution.toFixed(2)}`,
      );
    }
  }

  const certCount = Array.isArray(extraction.certifications) ? extraction.certifications.length : 0;
  const rawCertBonus = Math.min(certCount * 1.5, 7);
  formulaLines.push(`Cert bonus (raw): min(${certCount}×1.5, 7) = ${rawCertBonus}`);

  const impactCount = Array.isArray(extraction.quantified_impact)
    ? extraction.quantified_impact.length
    : 0;
  const rawImpactBonus = Math.min(impactCount * 2, 8);
  formulaLines.push(`Impact bonus (raw): min(${impactCount}×2, 8) = ${rawImpactBonus}`);

  const greenCount = Array.isArray(extraction.green_flags) ? extraction.green_flags.length : 0;
  const rawGreenBonus = Math.min(greenCount * 2, 12);
  formulaLines.push(`Green flags bonus (raw): min(${greenCount}×2, 12) = ${rawGreenBonus}`);

  // Bonuses differentiate good candidates — never rescue weak ones. Applied only when the
  // weighted dimension score alone clears BONUS_MIN_BASE_SCORE, and the combined total is
  // capped at BONUS_TOTAL_CAP (components scaled proportionally so the breakdown stays additive).
  const rawBonusTotal = rawCertBonus + rawImpactBonus + rawGreenBonus;
  let certBonus: number;
  let impactBonus: number;
  let greenBonus: number;
  if (rawDimScore < BONUS_MIN_BASE_SCORE) {
    certBonus = 0;
    impactBonus = 0;
    greenBonus = 0;
    formulaLines.push(
      `Bonuses withheld: base weighted score ${rawDimScore.toFixed(2)} < ${BONUS_MIN_BASE_SCORE}`,
    );
  } else if (rawBonusTotal > BONUS_TOTAL_CAP) {
    const scale = BONUS_TOTAL_CAP / rawBonusTotal;
    certBonus = rawCertBonus * scale;
    impactBonus = rawImpactBonus * scale;
    greenBonus = rawGreenBonus * scale;
    formulaLines.push(
      `Combined bonus capped at ${BONUS_TOTAL_CAP}: raw ${rawBonusTotal.toFixed(1)} scaled ×${scale.toFixed(3)}`,
    );
  } else {
    certBonus = rawCertBonus;
    impactBonus = rawImpactBonus;
    greenBonus = rawGreenBonus;
  }

  let redPenaltyUncapped = 0;
  const flags = Array.isArray(extraction.red_flags) ? extraction.red_flags : [];
  for (const rf of flags) {
    const sev = typeof rf?.severity === "string" ? rf.severity : "moderate";
    redPenaltyUncapped += redPenaltyForFlag(sev);
  }
  const redPenalty = Math.min(redPenaltyUncapped, RED_FLAG_PENALTY_CAP);
  formulaLines.push(
    `Red flag penalty: uncapped ${redPenaltyUncapped.toFixed(1)}, capped at ${redPenalty}`,
  );

  let finalScore = rawDimScore + certBonus + impactBonus + greenBonus - redPenalty;
  const floor = Number.isFinite(scoreFloor) ? scoreFloor : 15;
  finalScore = Math.min(100, Math.max(floor, finalScore));

  // Label from the ROUNDED score — the integer we actually return/display — so a raw 59.6
  // (shown as 60) gets the "Good Fit" band, not the sub-threshold label of the raw float.
  const roundedScore = Math.round(finalScore);
  const fitLabel = fitLabelForScore(roundedScore, fitThresholds);
  const fitLabelColor = FIT_LABEL_COLORS[fitLabel] ?? "#e5e7eb";

  const breakdown: ScoreBreakdown = {
    rawDimScore,
    certBonus,
    impactBonus,
    greenBonus,
    redPenalty,
    redPenaltyUncapped,
    dimensions,
    formulaLines,
  };

  return { fitScore: roundedScore, fitLabel, fitLabelColor, breakdown };
}
