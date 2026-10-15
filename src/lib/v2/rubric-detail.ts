/**
 * What a rubric is made of, in the terms the approved design shows.
 *
 * A rubric is the answer to "why did she get 79?", asked months later. So this
 * renders three things and refuses to guess at any of them: the weights that
 * produced the number, the thresholds that turned it into a verdict, and who
 * approved that combination and when.
 *
 * Weight keys are stored as machine names (`test_automation`, `years_exp`) and
 * shown to people, so they are humanised here rather than in the page — the
 * governance screen and the recruiter screen must not disagree about what a
 * dimension is called.
 */
export interface RubricWeights {
  [dimension: string]: number;
}

export interface FitThresholds {
  weak?: number;
  moderate?: number;
  good?: number;
  strong?: number;
}

export interface WeightRow {
  key: string;
  label: string;
  weight: number;
  /** Share of the total, so a set that does not sum to 100 still reads true. */
  share: number;
}

/** `years_exp` → "Years of experience". Expanded because the abbreviations lie. */
const KNOWN: Record<string, string> = {
  years_exp: "Years of experience",
  years_experience: "Years of experience",
  cicd_integration: "CI/CD integration",
  api_testing: "API testing",
};

export function dimensionLabel(key: string): string {
  if (KNOWN[key]) return KNOWN[key];
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Weights, heaviest first, with each one's true share.
 *
 * Stored weights do not always sum to 100 — templates get edited a dimension at
 * a time. Showing the raw number as a percentage would then misstate what the
 * score is made of, so the share is computed against the actual total.
 */
export function weightRows(weights: RubricWeights | null | undefined): WeightRow[] {
  const entries = Object.entries(weights ?? {}).filter(
    ([, v]) => typeof v === "number" && Number.isFinite(v) && v > 0,
  );
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (total <= 0) return [];
  return entries
    .map(([key, weight]) => ({
      key,
      label: dimensionLabel(key),
      weight,
      share: Math.round((weight / total) * 100),
    }))
    .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
}

/** True when the stored weights do not add up — worth saying out loud. */
export function weightsSumTo100(weights: RubricWeights | null | undefined): boolean {
  const total = Object.values(weights ?? {}).reduce(
    (sum, v) => sum + (typeof v === "number" && Number.isFinite(v) ? v : 0),
    0,
  );
  return Math.round(total) === 100;
}

export interface Band {
  label: string;
  range: string;
  meaning: string;
  tone: "good" | "mid" | "low";
}

/**
 * The thresholds as bands a recruiter can act on.
 *
 * Below the bar is not "reject" — it is "Talent Pool with a reason", which is
 * the whole point of making rejections carry one.
 */
export function bands(thresholds: FitThresholds | null | undefined): Band[] {
  const strong = thresholds?.strong;
  const good = thresholds?.good;
  if (strong == null || good == null) return [];
  return [
    {
      label: "Clears",
      range: `≥ ${strong}`,
      meaning: "advance recommended",
      tone: "good",
    },
    {
      label: "Human judgement",
      range: `${good}–${strong - 1}`,
      meaning: "a person decides, not the score",
      tone: "mid",
    },
    {
      label: "Below bar",
      range: `< ${good}`,
      meaning: "Talent Pool, with a reason",
      tone: "low",
    },
  ];
}

export interface ClearRate {
  /** Null when nothing has been scored — never 0%, which reads as a failure. */
  pct: number | null;
  cleared: number;
  scored: number;
  /** Healthy is 15–30%: below it the bar is too high, above it too low. */
  verdict: "too tight" | "healthy" | "too loose" | null;
}

/**
 * How many scored candidates clear this bar.
 *
 * A rubric nobody clears is not a high standard, it is a broken filter — and a
 * rubric everybody clears is not filtering. Both are invisible without this
 * number, which is why the design puts it beside the weights.
 */
export function clearRate(
  scores: Array<number | null>,
  thresholds: FitThresholds | null,
): ClearRate {
  const strong = thresholds?.strong;
  const valid = scores.filter((s): s is number => typeof s === "number" && Number.isFinite(s));
  if (strong == null || valid.length === 0) {
    return { pct: null, cleared: 0, scored: valid.length, verdict: null };
  }
  const cleared = valid.filter((s) => s >= strong).length;
  const pct = Math.round((cleared / valid.length) * 100);
  const verdict = pct < 15 ? "too tight" : pct > 30 ? "too loose" : "healthy";
  return { pct, cleared, scored: valid.length, verdict };
}

/** "approved · Priya N. · 12 Jul", or the reason there is no such line. */
export function approvalLine(
  approverName: string | null,
  approvedAt: string | null,
): { text: string; approved: boolean } {
  if (!approvedAt) {
    return { text: "not approved — scoring falls back to the generic bar", approved: false };
  }
  const d = new Date(approvedAt);
  const when = Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const who = approverName?.trim() || "unnamed approver";
  return { text: `approved · ${who}${when ? ` · ${when}` : ""}`, approved: true };
}
