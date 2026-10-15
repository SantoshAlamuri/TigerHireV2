/**
 * Verdict Engine — decision matrix combining Score, Market Position, and Profile Match.
 */

import type { MarketScore } from "./market-score";
import type { FitThresholds } from "./types";
import { DEFAULT_FIT_THRESHOLDS } from "./constants";
import { VERDICT_ACTIONS } from "@/lib/brand";

export interface Verdict {
  label: string;
  icon: string;
  color: string;
  bg: string;
  action: string;
}

/**
 * Decision matrix ("high" = fitScore >= the JD Base "good" band threshold, so the verdict
 * always agrees with the band chip shown next to it):
 * | FitScore | Market    | Ideal Match | Verdict     | Action                          |
 * |----------|-----------|-------------|-------------|---------------------------------|
 * | >=good   | Top 25%   | >=65%       | Strong Hire | Interview immediately           |
 * | >=good   | Top 25%   | <65%        | Strong Hire | Interview - close to ideal      |
 * | >=good   | Below 25% | Any         | Safe Hire   | Solid match, common in market   |
 * | <good    | Top 25%   | >=40%       | Hidden Gem  | Rare profile - dig deeper       |
 * | <good    | Top 25%   | <40%        | Niche Talent| Rare but significant gaps       |
 * | <good    | Below 25% | Any         | Pass        | Does not match, below average   |
 * | Any      | No data   | Any         | FitScore    | Market data building            |
 */
export function computeVerdict(
  fitScore: number,
  market: MarketScore,
  idealMatchPct: number,
  fitThresholds: FitThresholds = DEFAULT_FIT_THRESHOLDS,
): Verdict {
  const fitHigh = fitScore >= fitThresholds.good;
  const marketHigh = market.topPct != null && market.topPct <= 25;

  if (market.percentile === null) {
    return fitHigh
      ? {
          label: "Good Fit",
          icon: "check",
          color: "#0C447C",
          bg: "#D6E8F7",
          action: VERDICT_ACTIONS.coldStartHigh,
        }
      : {
          label: "Moderate",
          icon: "minus",
          color: "#7A5B17",
          bg: "#FFF2CC",
          action: VERDICT_ACTIONS.coldStartLow,
        };
  }

  if (fitHigh && marketHigh) {
    return idealMatchPct >= 65
      ? {
          label: "Strong Hire",
          icon: "star",
          color: "#1B7A1B",
          bg: "#C6EFCE",
          action: "Interview immediately",
        }
      : {
          label: "Strong Hire",
          icon: "star",
          color: "#1B7A1B",
          bg: "#C6EFCE",
          action: "Interview - close to ideal",
        };
  }

  if (fitHigh && !marketHigh) {
    return {
      label: "Safe Hire",
      icon: "check",
      color: "#0C447C",
      bg: "#D6E8F7",
      action: "Solid match, common in market",
    };
  }

  if (!fitHigh && marketHigh && idealMatchPct >= 40) {
    return {
      label: "Hidden Gem",
      icon: "diamond",
      color: "#BA7517",
      bg: "#FAEEDA",
      action: "Rare profile - dig deeper",
    };
  }

  if (!fitHigh && marketHigh && idealMatchPct < 40) {
    return {
      label: "Niche Talent",
      icon: "target",
      color: "#7A5B17",
      bg: "#FFF2CC",
      action: "Rare but significant gaps",
    };
  }

  return {
    label: "Pass",
    icon: "x",
    color: "#791F1F",
    bg: "#FFC7CE",
    action: "Does not match, below average",
  };
}
