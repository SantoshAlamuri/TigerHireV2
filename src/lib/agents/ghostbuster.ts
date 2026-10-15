/**
 * Heuristic reliability / engagement signal (`ghost_risk_score`, 0–100).
 * Lower score = higher risk. Used for shortlist sizing and recruiter UX.
 *
 * Not the CV authenticity LLM agent (`ghostbuster-authenticity` / Candidate Authenticity Check).
 *
 * Feature-flagged via "ghostbuster" key. Check before calling.
 */

export interface GhostBusterInput {
  firstResponseMinutes?: number | null;
  cvSubmittedMinutes?: number | null;
  vouchCount?: number;
  availability?: string | null;
}

export function calculateGhostRiskScore(input: GhostBusterInput): number {
  let score = 50;

  if (input.firstResponseMinutes != null) {
    if (input.firstResponseMinutes < 60) score += 15;
    else if (input.firstResponseMinutes < 240) score += 8;
    else if (input.firstResponseMinutes > 1440) score -= 10;
  }

  if (input.cvSubmittedMinutes != null) {
    if (input.cvSubmittedMinutes < 30) score += 15;
    else if (input.cvSubmittedMinutes < 120) score += 8;
    else if (input.cvSubmittedMinutes > 2880) score -= 10;
  }

  if ((input.vouchCount ?? 0) > 0) score += 15;
  if ((input.vouchCount ?? 0) > 1) score += 5;

  if (input.availability === "immediate" || input.availability === "active") score += 10;
  else if (input.availability === "1_month") score += 5;
  else if (input.availability === "3_plus_months") score -= 5;
  else if (input.availability === "not_looking") score -= 15;

  return Math.min(100, Math.max(0, score));
}

export function getGhostRiskLabel(score: number): "LOW" | "MEDIUM" | "HIGH" {
  if (score >= 75) return "LOW";
  if (score >= 50) return "MEDIUM";
  return "HIGH";
}
