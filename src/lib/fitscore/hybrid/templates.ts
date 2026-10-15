/**
 * Weight normalization for dynamic per-role dimensions.
 * Each JD Base / template defines its own dimension names;
 * this module ensures they always sum to exactly 100.
 */

import type { ScoringWeights } from "./types";

/** Scale arbitrary weights so they sum to exactly 100 (integer-safe). */
export function normalizeWeightsTo100(w: ScoringWeights): ScoringWeights {
  const keys = Object.keys(w).filter((k) => {
    const v = w[k];
    return typeof v === "number" && Number.isFinite(v) && v > 0;
  });
  if (keys.length === 0) return {};

  const sum = keys.reduce((s, k) => s + w[k], 0);
  if (sum <= 0) return {};

  const scaled = keys.map((k) => Math.round((w[k] * 100) / sum));
  let drift = 100 - scaled.reduce((a, b) => a + b, 0);
  let i = 0;
  while (drift !== 0 && i < 200) {
    const idx = i % scaled.length;
    if (drift > 0) {
      scaled[idx] += 1;
      drift -= 1;
    } else if (scaled[idx] > 0) {
      scaled[idx] -= 1;
      drift += 1;
    }
    i += 1;
  }

  const out: ScoringWeights = {};
  keys.forEach((k, j) => {
    out[k] = scaled[j];
  });
  return out;
}

/** Merge deltas into template weights, then re-normalize. */
export function mergeWeightDeltas(
  template: ScoringWeights,
  deltas: Record<string, number>,
): ScoringWeights {
  const merged = { ...template };
  for (const [k, d] of Object.entries(deltas)) {
    if (typeof d === "number" && Number.isFinite(d)) {
      merged[k] = Math.max(0, Math.round((merged[k] ?? 0) + d));
    }
  }
  return normalizeWeightsTo100(merged);
}
