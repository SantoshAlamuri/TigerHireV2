import type { FitScore } from "@/types";

export function marketHeadlineFromScore(score: FitScore): { value: string; sub?: string } {
  if (score.marketLabel) {
    const shortened =
      score.marketLabel.split(" — ")[0]?.split(" - ")[0]?.trim() ?? score.marketLabel;
    return { value: shortened };
  }
  if (score.marketPercentile != null && Number.isFinite(score.marketPercentile)) {
    const top = Math.max(0, Math.min(100, 100 - Math.round(score.marketPercentile)));
    return { value: `Top ${top}%` };
  }
  return { value: "—", sub: "Building pool…" };
}

/**
 * Displayed FitScore headline. The persisted overall_score is authoritative: the hybrid
 * pipeline writes it as the calibrated blend and select-blend rewrites it when a recruiter
 * picks the shadow score. Raw primaryScore is only a fallback for legacy/partial rows where
 * overall is missing or zero — preferring it unconditionally made blend selection a no-op.
 */
export function displayedFitScore(score: FitScore): number {
  if (score.overallScore != null && score.overallScore > 0) return score.overallScore;
  if (score.primaryScore != null && score.primaryScore > 0) return score.primaryScore;
  return score.overallScore;
}

export function hasMarketPool(score: FitScore): boolean {
  return score.marketPercentile != null && Number.isFinite(score.marketPercentile);
}

export function marketAndConfidenceContextLine(score: FitScore): string | null {
  if (!hasMarketPool(score)) return null;
  const top = Math.max(0, Math.min(100, 100 - Math.round(score.marketPercentile as number)));
  const conf = score.evidenceConfidenceScore;
  if (conf == null || !Number.isFinite(conf)) return `Top ${top}%`;
  return `Top ${top}% · ${conf.toFixed(2)} confidence`;
}

export function mustHaveCountFromScore(score: FitScore): number | null {
  const snapshot = score.rubricSnapshot as
    | { ideal_candidate_profile?: { must_haves?: unknown } }
    | null
    | undefined;
  const list = snapshot?.ideal_candidate_profile?.must_haves;
  if (!Array.isArray(list)) return null;
  return list.length;
}

export function icpCoverageFromScore(score: FitScore): { label: string; gaps: string[] } | null {
  const pct = score.idealMatchPct;
  if (pct == null || !Number.isFinite(pct)) return null;
  const gaps = Array.isArray(score.idealGaps) ? score.idealGaps : [];
  const total = mustHaveCountFromScore(score);
  if (total != null && total > 0) {
    const met = Math.max(0, Math.min(total, Math.round((pct / 100) * total)));
    return { label: `Meets ${met} of ${total} must-haves`, gaps };
  }
  return { label: `${Math.round(pct)}% ICP match`, gaps };
}
