/**
 * Cross-model score normalization (Phase 5).
 * Maps raw engine scores toward a common scale when mixing Haiku/Sonnet extractions.
 */

const HAIKU_OFFSET = -1.5;
const SONNET_OFFSET = 0;

export function calibrateScore(rawScore: number, modelUsed: string): number {
  const model = modelUsed.toLowerCase();
  const offset = model.includes("haiku") ? HAIKU_OFFSET : SONNET_OFFSET;
  return Math.round(Math.min(100, Math.max(0, rawScore + offset)));
}

export function calibrateDimensionScore(value: number, modelUsed: string): number {
  const model = modelUsed.toLowerCase();
  const scale = model.includes("haiku") ? 0.95 : 1;
  return Math.min(10, Math.max(1, Math.round(value * scale * 10) / 10));
}
