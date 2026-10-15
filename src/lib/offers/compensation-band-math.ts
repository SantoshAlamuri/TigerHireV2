/**
 * Client-safe helpers for B7 band UI (no DB / entitlements).
 */

export type BandBounds = {
  min_amount: number;
  max_amount: number;
};

export function deviationFromBand(amount: number, min: number, max: number): number {
  if (amount > max && max > 0) {
    return ((amount - max) / max) * 100;
  }
  if (amount < min && min > 0) {
    return ((min - amount) / min) * 100;
  }
  return 0;
}

export function compareCtcToBand(
  ctc: number,
  band: BandBounds,
): { within: boolean; deviation: number } {
  const min = Number(band.min_amount);
  const max = Number(band.max_amount);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { within: true, deviation: 0 };
  }
  if (ctc >= min && ctc <= max) {
    return { within: true, deviation: 0 };
  }
  return { within: false, deviation: deviationFromBand(ctc, min, max) };
}
