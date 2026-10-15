/**
 * Single source of truth for colouring any 0–100 score (FitScore, intent, etc.).
 *
 * Before this helper the FitRing bucketed at 80/60 with an amber→rose palette
 * while the intent pill bucketed at 80/60/40/20 with an emerald→zinc palette —
 * so the same "82" read as two different colours depending on the component
 * (audit F-03). Everything that colours a score now routes through here and the
 * `--score-*` token ramp in globals.css.
 */

export type ScoreTone = "strong" | "good" | "fair" | "weak";

/** Canonical thresholds for the whole app. */
export function scoreToTone(score: number): ScoreTone {
  const s = Math.max(0, Math.min(100, score));
  if (s >= 80) return "strong";
  if (s >= 60) return "good";
  if (s >= 40) return "fair";
  return "weak";
}

const TONE_VAR: Record<ScoreTone, string> = {
  strong: "var(--score-strong)",
  good: "var(--score-good)",
  fair: "var(--score-fair)",
  weak: "var(--score-weak)",
};

/** CSS value (e.g. for an SVG `stroke` or inline style). */
export function scoreToneColorVar(score: number): string {
  return TONE_VAR[scoreToTone(score)];
}

const TONE_TEXT_CLASS: Record<ScoreTone, string> = {
  strong: "text-[color:var(--score-strong)]",
  good: "text-[color:var(--score-good)]",
  fair: "text-[color:var(--score-fair)]",
  weak: "text-[color:var(--score-weak)]",
};

const TONE_BG_CLASS: Record<ScoreTone, string> = {
  strong: "bg-[color:var(--score-strong-bg)]",
  good: "bg-[color:var(--score-good-bg)]",
  fair: "bg-[color:var(--score-fair-bg)]",
  weak: "bg-[color:var(--score-weak-bg)]",
};

/** Tailwind text-colour utility for a score. */
export function scoreToneTextClass(score: number): string {
  return TONE_TEXT_CLASS[scoreToTone(score)];
}

/** Tailwind background utility for a score (tinted chip background). */
export function scoreToneBgClass(score: number): string {
  return TONE_BG_CLASS[scoreToTone(score)];
}

/** Convenience: both the text and background utilities for a score chip. */
export function scoreToneClasses(score: number): { text: string; bg: string } {
  const tone = scoreToTone(score);
  return { text: TONE_TEXT_CLASS[tone], bg: TONE_BG_CLASS[tone] };
}
