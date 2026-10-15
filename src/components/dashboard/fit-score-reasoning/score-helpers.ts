import type { FitScore } from "@/types";

export function gradeChipClasses(grade: string): string {
  const value = grade.toUpperCase();
  if (value === "A") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (value === "B") return "bg-sky-500/15 text-sky-300 border-sky-500/30";
  if (value === "C") return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  return "bg-red-500/15 text-red-300 border-red-500/30";
}

export function hashPreview(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 10)}...`;
}

export function marketHeadline(score: FitScore): { value: string; sub?: string } {
  if (score.marketLabel) {
    const shortened =
      score.marketLabel.split(" — ")[0]?.split(" - ")[0]?.trim() ?? score.marketLabel;
    return { value: shortened };
  }
  if (score.marketPercentile != null && Number.isFinite(score.marketPercentile)) {
    const top = Math.max(0, Math.min(100, 100 - Math.round(score.marketPercentile)));
    return { value: `Top ${top}%` };
  }
  return { value: "—", sub: "Market data building..." };
}

/** Primary number or label for confidence card (mockup-style). */
export function confidencePrimaryDisplay(score: FitScore): string {
  const pq = Number(score.parseQualityScore);
  if (Number.isFinite(pq) && pq > 0 && pq <= 1) return pq.toFixed(2);
  if (Number.isFinite(pq) && pq > 1 && pq <= 100) return (pq / 100).toFixed(2);
  const ev = Number(score.evidenceConfidenceScore);
  if (Number.isFinite(ev) && ev > 0 && ev <= 1) return ev.toFixed(2);
  const c = score.confidence;
  if (c === "high") return "High";
  if (c === "medium") return "Medium";
  if (c === "low") return "Low";
  return "—";
}

export function confidenceSecondaryLabel(score: FitScore): string {
  const pq = Number(score.parseQualityScore);
  if (Number.isFinite(pq) && pq > 0 && pq <= 1) return "Signal strength";
  const ev = Number(score.evidenceConfidenceScore);
  if (Number.isFinite(ev) && ev > 0 && ev <= 1) return "Evidence confidence";
  return "Confidence band";
}

/**
 * Parse quality on a 0–1 scale when present.
 * Handles scores persisted as decimals (0.1) or whole percents (10 → 0.1).
 */
export function normalizedParseQuality01(score: FitScore): number | null {
  const pq = Number(score.parseQualityScore);
  if (!Number.isFinite(pq) || pq <= 0) return null;
  if (pq <= 1) return pq;
  if (pq <= 100) return pq / 100;
  return null;
}

/** Scarce / high-upside hint — heuristic from market rarity + moderate ideal fit. */
export function hiddenGemHeuristic(score: FitScore): boolean {
  if (score.marketPercentile == null || !Number.isFinite(score.marketPercentile)) return false;
  const topPct = Math.max(0, Math.min(100, 100 - Math.round(score.marketPercentile)));
  const ideal = score.idealMatchPct ?? 0;
  return topPct <= 22 && ideal > 0 && ideal < 72 && score.overallScore >= 60;
}

export function verdictBadgeTone(
  label: string | null,
): "strong" | "good" | "warn" | "risk" | "neutral" {
  if (!label) return "neutral";
  const v = label.toLowerCase();
  if (v.includes("strong") || v.includes("hidden gem")) return "strong";
  if (v.includes("good") || v.includes("advance")) return "good";
  if (v.includes("moderate") || v.includes("mixed")) return "warn";
  if (
    v.includes("weak") ||
    v.includes("reject") ||
    v.includes("no hire") ||
    v.includes("not a fit")
  )
    return "risk";
  return "neutral";
}

export function verdictBadgeClass(tone: ReturnType<typeof verdictBadgeTone>): string {
  switch (tone) {
    case "strong":
      return "border-emerald-500/40 bg-emerald-500 text-emerald-950 shadow-[0_0_24px_-4px_rgba(16,185,129,0.45)]";
    case "good":
      return "border-sky-500/35 bg-sky-500/90 text-sky-950";
    case "warn":
      return "border-amber-500/40 bg-amber-500/85 text-amber-950";
    case "risk":
      return "border-rose-500/40 bg-rose-600/90 text-white";
    default:
      return "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)]";
  }
}

export function getEvidenceForCriterion(
  score: FitScore,
  criterionId: string,
  criterionName: string,
): string | null {
  const snapshot = score.evidenceSnapshot;
  if (!snapshot || typeof snapshot !== "object") return null;
  const keyed = snapshot as Record<string, unknown>;
  const byId = keyed[criterionId];
  if (typeof byId === "string" && byId.trim()) return byId;
  const byName = keyed[criterionName];
  if (typeof byName === "string" && byName.trim()) return byName;
  const verdictQuotes = score.verdictEvidenceQuotes ?? [];
  const targetName = criterionName.trim().toLowerCase();
  const targetId = criterionId.trim().toLowerCase();
  const matchedQuote = verdictQuotes.find((quote) => {
    const dimension = quote.dimension.trim().toLowerCase();
    return dimension === targetName || dimension === targetId || dimension.includes(targetName);
  });
  if (matchedQuote?.quote) return matchedQuote.quote;
  return null;
}
