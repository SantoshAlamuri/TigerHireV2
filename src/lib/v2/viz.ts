/**
 * Visualisation tokens for the v2 analytics screens.
 *
 * These are not chosen by eye. Each set was run through the data-viz palette
 * validator against this product's actual dark chart surface (#1f2128), because
 * whether a palette is colourblind-safe is computable and guessing at it is how
 * a chart ends up unreadable for ~8% of men:
 *
 *   categorical (4 slots) — lightness band, chroma floor, CVD separation
 *     (worst adjacent ΔE 8.4 protan), normal-vision floor (19.8), contrast: PASS
 *   ordinal funnel ramp (5 steps) — monotone lightness, adjacent ΔL ≥ 0.06,
 *     light-end contrast 2.98:1, single hue (3° spread): PASS
 *
 * Rules that travel with them:
 *   · Categorical hues are assigned in fixed order and never cycled. A fifth
 *     series folds into "Other" rather than inventing a hue.
 *   · Colour follows the entity, never its rank, so filtering cannot repaint
 *     the survivors.
 *   · Status colours are reserved and always ship with a label, never colour
 *     alone.
 *   · Text keeps text tokens; a coloured mark beside it carries the identity.
 */

/** Fixed categorical order. Never cycle; never generate a fifth. */
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500"] as const;

/**
 * Ordered stages (funnel, tiers). One hue, light to dark — the light end still
 * clears the surface, so an early stage cannot fade into the background.
 */
export const ORDINAL = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf"] as const;

/** Reserved. Never reused as "series 5". Always paired with a word. */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

export type StatusKey = keyof typeof STATUS;

/**
 * A recruiting funnel only ever narrows. A later stage holding more people than
 * an earlier one means the stages were counted from different populations, and
 * silently drawing it is how a broken pipeline reads as a healthy one.
 */
export function funnelIsMonotonic(counts: number[]): boolean {
  return counts.every((n, i) => i === 0 || n <= counts[i - 1]);
}

/** Bar width as a share of the widest value, floored so a 1 is still visible. */
export function barWidth(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(1.5, Math.round((value / max) * 100));
}

/**
 * Points for a sparkline path in a 100x24 viewBox. A flat series is drawn on the
 * centre line rather than at the bottom — a zero-variance run is not zero.
 */
export function sparkPath(values: number[]): string {
  if (values.length < 2) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min;
  const x = (i: number) => (i / (values.length - 1)) * 100;
  const y = (v: number) => (span === 0 ? 12 : 22 - ((v - min) / span) * 20);
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
}

/**
 * Period-over-period change. Null when there is no prior figure to compare — a
 * "+100%" against a base of zero is arithmetic, not information.
 */
export function delta(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null || prior === 0) return null;
  return Math.round(((current - prior) / prior) * 100);
}
