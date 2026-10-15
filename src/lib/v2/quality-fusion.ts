/**
 * Quality-of-hire tiles, read from the server report that already computes them.
 *
 * These four were hardcoded null in ta-metrics with a caption explaining that
 * the data was missing. The data was not missing — nothing asked for it. A tile
 * that cannot populate when the data arrives is not an empty state, it is dead
 * code wearing one, and it is worse than a missing tile because it looks like a
 * measurement that came back negative.
 */
import type { Metric } from "./ta-metrics";

export interface QualityByJob {
  hires_count?: number;
  avg_performance_rating?: number | null;
  rated_count?: number;
}

export interface PulseByJob {
  pulses_tracked?: number;
  pulses_responded?: number;
  left_count?: number;
  avg_pulse_score?: number | null;
}

export interface ValidityBand {
  fitscore_band: string;
  hires?: number;
  avg_performance_rating?: number | null;
}

const plain = (label: string, value: number | null, unit: string, note: string): Metric => ({
  label,
  value,
  unit,
  note,
  tone: "plain",
});

const round1 = (n: number) => Math.round(n * 10) / 10;

export function fuseQuality(
  quality: QualityByJob[],
  pulse: PulseByJob[],
  validity: ValidityBand[],
): {
  qualityOfHire: Metric;
  retention90: Metric;
  hmSatisfaction: Metric;
  fitScoreValidity: Metric;
} {
  // Weighted by rated hires: a job with nine ratings must outweigh one with a
  // single rating, which a mean of job averages would not do.
  let ratingSum = 0;
  let ratedTotal = 0;
  for (const r of quality) {
    const n = r.rated_count ?? 0;
    if (r.avg_performance_rating == null || n <= 0) continue;
    ratingSum += r.avg_performance_rating * n;
    ratedTotal += n;
  }

  const tracked = pulse.reduce((n, r) => n + (r.pulses_tracked ?? 0), 0);
  const left = pulse.reduce((n, r) => n + (r.left_count ?? 0), 0);
  const responded = pulse.reduce((n, r) => n + (r.pulses_responded ?? 0), 0);

  let pulseSum = 0;
  let pulseN = 0;
  for (const r of pulse) {
    const n = r.pulses_responded ?? 0;
    if (r.avg_pulse_score == null || n <= 0) continue;
    pulseSum += r.avg_pulse_score * n;
    pulseN += n;
  }

  const validityHires = validity.reduce((n, b) => n + (b.hires ?? 0), 0);
  const rated = validity.filter((b) => b.avg_performance_rating != null);
  // The signal is whether the top band actually outperforms the bottom one.
  // Below ten hires the difference is noise dressed as evidence.
  const spread =
    validityHires >= 10 && rated.length >= 2
      ? round1(
          (rated[0].avg_performance_rating as number) -
            (rated[rated.length - 1].avg_performance_rating as number),
        )
      : null;

  return {
    qualityOfHire: plain(
      "Quality of hire",
      ratedTotal > 0 ? round1(ratingSum / ratedTotal) : null,
      "/5",
      ratedTotal > 0
        ? `across ${ratedTotal} rated hire${ratedTotal === 1 ? "" : "s"}`
        : "No performance ratings recorded against hires yet",
    ),
    retention90: plain(
      "90-day retention",
      tracked > 0 ? Math.round(((tracked - left) / tracked) * 100) : null,
      "%",
      tracked > 0 ? `${tracked - left} of ${tracked} still here` : "No 90-day pulses tracked yet",
    ),
    hmSatisfaction: plain(
      "HM satisfaction",
      pulseN > 0 ? round1(pulseSum / pulseN) : null,
      "/10",
      pulseN > 0 ? `${responded} responses` : "No post-hire pulse responses yet",
    ),
    fitScoreValidity: plain(
      "FitScore validity",
      spread,
      " pts",
      spread !== null
        ? `top band outperforms bottom by ${spread} across ${validityHires} hires`
        : `Needs at least 10 rated hires across bands — ${validityHires} so far`,
    ),
  };
}
