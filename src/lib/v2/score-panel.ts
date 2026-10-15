import { isDisplayableEvidence } from "./evidence-pack";
import { bandFor, type Band } from "./score-display";

/**
 * The three scores and the flag pips.
 *
 * Everything here is already persisted on `fit_scores` — ideal_match_pct,
 * market_percentile, market_label, and the green/amber/red flag arrays. The
 * first build of Application Review showed FitScore alone and dropped the rest,
 * which made the queue unscannable: you had to open every candidate to learn
 * anything about them.
 *
 * Nothing is invented. A missing value shows an em dash, never a zero dressed
 * up as a measurement.
 */
export interface ScorePanelInput {
  overallScore: number | null;
  idealMatchPct: number | null;
  marketPercentile: number | null;
  marketLabel: string | null;
  greenFlags: (string | null)[] | null;
  amberFlags: (string | null)[] | null;
  redFlags: (string | null)[] | null;
}

export interface ScoreCell {
  label: string;
  value: string;
  tone: Band["tone"];
}

export interface ScorePanel {
  fit: ScoreCell;
  icp: ScoreCell;
  market: ScoreCell;
}

/**
 * Stored labels read like "Top 5% - Exceptional". Beside a number the recruiter
 * is already reading, the adjective is noise — keep the rank.
 */
function shortMarket(label: string | null, percentile: number | null): string {
  const fromLabel = label?.match(/Top\s+\d+%/i)?.[0];
  if (fromLabel) return fromLabel.replace(/\s+/, " ");
  if (typeof percentile === "number" && percentile > 0) return `Top ${percentile}%`;
  return "—";
}

export function scorePanel(input: ScorePanelInput): ScorePanel {
  const band = bandFor(input.overallScore);
  const hasScore =
    typeof input.overallScore === "number" &&
    Number.isFinite(input.overallScore) &&
    input.overallScore >= 0;
  const hasIcp =
    typeof input.idealMatchPct === "number" &&
    Number.isFinite(input.idealMatchPct) &&
    input.idealMatchPct >= 0;

  return {
    fit: {
      label: "FitScore",
      value: hasScore ? String(input.overallScore) : "—",
      tone: band.tone,
    },
    icp: {
      label: "ICP match",
      value: hasIcp ? `${input.idealMatchPct}%` : "—",
      tone: "none",
    },
    market: {
      label: "Market",
      value: shortMarket(input.marketLabel, input.marketPercentile),
      tone: "none",
    },
  };
}

export interface FlagPips {
  green: number;
  amber: number;
  red: number;
}

const count = (arr: (string | null)[] | null): number =>
  (arr ?? []).filter(isDisplayableEvidence).length;

/**
 * Per-candidate flag counts, shown in the queue so the shape of a candidate is
 * visible before they are opened — 4·2·0 reads very differently from 0·2·4.
 */
export function flagPips(input: ScorePanelInput): FlagPips {
  return {
    green: count(input.greenFlags),
    amber: count(input.amberFlags),
    red: count(input.redFlags),
  };
}
