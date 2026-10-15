import { describe, it, expect } from "vitest";
import { scorePanel, flagPips, type ScorePanelInput } from "@/lib/v2/score-panel";

/**
 * The three scores and the flag pips the approved design calls for.
 *
 * All of this is already stored — ideal_match_pct, market_percentile,
 * market_label, and the green/amber/red flag arrays. The first build showed
 * only FitScore and silently dropped the rest, which is why the queue could
 * not be scanned before opening anyone.
 */
function input(over: Partial<ScorePanelInput> = {}): ScorePanelInput {
  return {
    overallScore: 79,
    idealMatchPct: 81,
    marketPercentile: 14,
    marketLabel: "Top 14% - Strong",
    greenFlags: [],
    amberFlags: [],
    redFlags: [],
    ...over,
  };
}

describe("scorePanel", () => {
  it("returns all three scores when the data is there", () => {
    const p = scorePanel(input());
    expect(p.fit.value).toBe("79");
    expect(p.icp.value).toBe("81%");
    expect(p.market.value).toBe("Top 14%");
  });

  it("shortens a verbose market label to the rank, not the adjective", () => {
    // Stored labels read "Top 5% - Exceptional"; the adjective is noise beside
    // a number the recruiter is already reading.
    expect(scorePanel(input({ marketLabel: "Top 5% - Exceptional" })).market.value).toBe("Top 5%");
  });

  it("falls back to the percentile when the label is missing", () => {
    const p = scorePanel(input({ marketLabel: null, marketPercentile: 22 }));
    expect(p.market.value).toBe("Top 22%");
  });

  it("shows a dash rather than inventing a rank when neither exists", () => {
    const p = scorePanel(input({ marketLabel: null, marketPercentile: null }));
    expect(p.market.value).toBe("—");
  });

  it("never shows a fabricated ICP match", () => {
    expect(scorePanel(input({ idealMatchPct: null })).icp.value).toBe("—");
    expect(scorePanel(input({ idealMatchPct: 0 })).icp.value).toBe("0%");
  });

  it("treats a missing overall score as unscored, not zero", () => {
    const p = scorePanel(input({ overallScore: null }));
    expect(p.fit.value).toBe("—");
    expect(p.fit.tone).toBe("none");
  });

  it("tones the hero score by band so it reads before it is parsed", () => {
    expect(scorePanel(input({ overallScore: 92 })).fit.tone).toBe("strong");
    expect(scorePanel(input({ overallScore: 78 })).fit.tone).toBe("good");
    expect(scorePanel(input({ overallScore: 64 })).fit.tone).toBe("moderate");
    expect(scorePanel(input({ overallScore: 41 })).fit.tone).toBe("weak");
  });
});

describe("flagPips", () => {
  it("counts each tier so a queue row shows the shape of a candidate", () => {
    const p = flagPips(
      input({ greenFlags: ["a", "b", "c", "d"], amberFlags: ["e", "f"], redFlags: [] }),
    );
    expect(p).toEqual({ green: 4, amber: 2, red: 0 });
  });

  it("is all zeros when nothing is flagged", () => {
    expect(flagPips(input())).toEqual({ green: 0, amber: 0, red: 0 });
  });

  it("survives null arrays from unscored rows", () => {
    const p = flagPips(input({ greenFlags: null, amberFlags: null, redFlags: null }));
    expect(p).toEqual({ green: 0, amber: 0, red: 0 });
  });

  it("ignores blank entries rather than counting them", () => {
    expect(flagPips(input({ greenFlags: ["real", "  ", ""] })).green).toBe(1);
  });
});
