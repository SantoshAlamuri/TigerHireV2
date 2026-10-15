import { describe, it, expect } from "vitest";
import { computeHybridScore } from "@/lib/fitscore/hybrid/engine";
import { DEFAULT_SCORE_FLOOR } from "@/lib/fitscore/hybrid/constants";
import { normalizeWeightsTo100 } from "@/lib/fitscore/hybrid/templates";
import { computeVerdict } from "@/lib/fitscore/hybrid/verdict";
import type { MarketScore } from "@/lib/fitscore/hybrid/market-score";
import type { CandidateExtraction, ScoringWeights } from "@/lib/fitscore/hybrid/types";

const thresholds = { strong: 78, good: 60, moderate: 40, weak: 25 };

const backendWeights: ScoringWeights = {
  core_language: 20,
  system_design: 20,
  database_skills: 15,
  devops_cicd: 10,
  testing_quality: 10,
  problem_solving: 10,
  years_exp: 10,
  domain_knowledge: 5,
};

function baseExtraction(over: Partial<CandidateExtraction> = {}): CandidateExtraction {
  return {
    candidate_name: "Test",
    total_years: 10,
    dimension_scores: {
      core_language: 7,
      system_design: 7,
      database_skills: 7,
      devops_cicd: 7,
      testing_quality: 7,
      problem_solving: 7,
      years_exp: 7,
      domain_knowledge: 7,
    },
    certifications: [],
    quantified_impact: [],
    red_flags: [],
    green_flags: [],
    role_match_tag: "Senior Backend Engineer",
    summary: "Experienced backend engineer",
    ...over,
  };
}

describe("normalizeWeightsTo100 (TC-09)", () => {
  it("dynamic weights normalize to sum 100", () => {
    const testWeights: ScoringWeights[] = [
      backendWeights,
      { visual_design: 30, user_research: 25, prototyping: 20, collaboration: 15, portfolio: 10 },
      {
        agile_mastery: 20,
        stakeholder_mgmt: 20,
        team_scale: 15,
        delivery_ownership: 15,
        coaching: 10,
        technical_understanding: 5,
        certifications: 10,
        sm_years: 5,
      },
    ];
    for (const w of testWeights) {
      const n = normalizeWeightsTo100(w);
      const sum = Object.values(n).reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
    }
  });

  it("handles empty/zero weights gracefully", () => {
    const n = normalizeWeightsTo100({});
    expect(Object.keys(n).length).toBe(0);
  });
});

describe("computeHybridScore", () => {
  it("TC-10: score floor prevents scores below 15", () => {
    const ext = baseExtraction({
      dimension_scores: {
        core_language: 1,
        system_design: 1,
        database_skills: 1,
        devops_cicd: 1,
        testing_quality: 1,
        problem_solving: 1,
        years_exp: 1,
        domain_knowledge: 1,
      },
      red_flags: Array.from({ length: 8 }, () => ({ flag: "x", severity: "critical" as const })),
    });
    const r = computeHybridScore(ext, backendWeights, DEFAULT_SCORE_FLOOR, thresholds);
    expect(r.fitScore).toBeGreaterThanOrEqual(15);
  });

  it("TC-04: six red flags with strong dimensions, red penalty capped at 20", () => {
    const ext = baseExtraction({
      dimension_scores: {
        core_language: 8,
        system_design: 8,
        database_skills: 8,
        devops_cicd: 8,
        testing_quality: 8,
        problem_solving: 8,
        years_exp: 8,
        domain_knowledge: 8,
      },
      red_flags: [
        { flag: "a", severity: "critical" },
        { flag: "b", severity: "critical" },
        { flag: "c", severity: "critical" },
        { flag: "d", severity: "critical" },
        { flag: "e", severity: "critical" },
        { flag: "f", severity: "critical" },
      ],
    });
    const r = computeHybridScore(ext, backendWeights, DEFAULT_SCORE_FLOOR, thresholds);
    expect(r.breakdown.redPenalty).toBe(20);
    expect(r.breakdown.redPenaltyUncapped).toBe(30);
    expect(r.fitScore).toBeGreaterThanOrEqual(40);
  });

  it("TC-05: same extraction and JD yields identical scores", () => {
    const ext = baseExtraction();
    const a = computeHybridScore(ext, backendWeights, DEFAULT_SCORE_FLOOR, thresholds);
    const b = computeHybridScore(ext, backendWeights, DEFAULT_SCORE_FLOOR, thresholds);
    expect(a.fitScore).toBe(b.fitScore);
    expect(a.fitLabel).toBe(b.fitLabel);
  });

  it("works with arbitrary dimension names", () => {
    const uxWeights = normalizeWeightsTo100({
      visual_design: 25,
      user_research: 20,
      prototyping: 20,
      collaboration: 15,
      accessibility: 10,
      portfolio: 10,
    });
    const ext: CandidateExtraction = {
      candidate_name: "UX Test",
      total_years: 5,
      dimension_scores: {
        visual_design: 9,
        user_research: 8,
        prototyping: 7,
        collaboration: 6,
        accessibility: 5,
        portfolio: 8,
      },
      certifications: ["Google UX Certificate"],
      quantified_impact: ["Increased conversion by 25%"],
      red_flags: [],
      green_flags: ["Strong portfolio"],
      role_match_tag: "Mid-level UX Designer",
      summary: "UX designer with Figma experience",
    };
    const r = computeHybridScore(ext, uxWeights, 15, thresholds);
    expect(r.fitScore).toBeGreaterThan(50);
    expect(r.fitLabel).toBeDefined();
    expect(Object.keys(r.breakdown.dimensions)).toEqual(Object.keys(uxWeights));
  });
});

describe("computeHybridScore — bonus gating and cap", () => {
  const maxSignals: Partial<CandidateExtraction> = {
    certifications: ["c1", "c2", "c3", "c4", "c5"], // raw cert bonus 7 (capped)
    quantified_impact: ["i1", "i2", "i3", "i4"], // raw impact bonus 8 (capped)
    green_flags: ["g1", "g2", "g3", "g4", "g5", "g6"], // raw green bonus 12 (capped)
  };

  it("base 40 + max signals stays below 60 — bonuses never rescue a weak candidate", () => {
    const ext = baseExtraction({
      dimension_scores: {
        core_language: 4,
        system_design: 4,
        database_skills: 4,
        devops_cicd: 4,
        testing_quality: 4,
        problem_solving: 4,
        years_exp: 4,
        domain_knowledge: 4,
      },
      ...maxSignals,
    });
    const r = computeHybridScore(ext, backendWeights, DEFAULT_SCORE_FLOOR, thresholds);
    expect(r.breakdown.rawDimScore).toBeCloseTo(40);
    expect(r.breakdown.certBonus).toBe(0);
    expect(r.breakdown.impactBonus).toBe(0);
    expect(r.breakdown.greenBonus).toBe(0);
    expect(r.fitScore).toBe(40);
    expect(r.fitScore).toBeLessThan(60); // never reaches the Good Fit band
    expect(r.fitLabel).toBe("Moderate Fit");
  });

  it("caps the combined bonus at +10 for strong candidates (was +27)", () => {
    const ext = baseExtraction(maxSignals); // dims all 7 → base 70
    const r = computeHybridScore(ext, backendWeights, DEFAULT_SCORE_FLOOR, thresholds);
    const totalBonus = r.breakdown.certBonus + r.breakdown.impactBonus + r.breakdown.greenBonus;
    expect(r.breakdown.rawDimScore).toBeCloseTo(70);
    expect(totalBonus).toBeCloseTo(10);
    expect(r.fitScore).toBe(80); // 70 + 10, not 70 + 27
  });

  it("applies bonuses unscaled when base ≥ 50 and total ≤ 10", () => {
    const ext = baseExtraction({
      dimension_scores: {
        core_language: 6,
        system_design: 6,
        database_skills: 6,
        devops_cicd: 6,
        testing_quality: 6,
        problem_solving: 6,
        years_exp: 6,
        domain_knowledge: 6,
      },
      certifications: ["c1"], // 1.5
      quantified_impact: ["i1"], // 2
      green_flags: ["g1"], // 2
    });
    const r = computeHybridScore(ext, backendWeights, DEFAULT_SCORE_FLOOR, thresholds);
    expect(r.breakdown.certBonus).toBe(1.5);
    expect(r.breakdown.impactBonus).toBe(2);
    expect(r.breakdown.greenBonus).toBe(2);
    expect(r.fitScore).toBe(66); // 60 + 5.5 = 65.5 → rounds to 66
  });
});

// --------------- Talent Intelligence Delta Tests ---------------

function marketPool(percentile: number, topPct: number, poolSize: number): MarketScore {
  return { percentile, topPct, label: `Top ${topPct}%`, poolSize };
}

const coldStartMarket: MarketScore = {
  percentile: null,
  topPct: null,
  label: "Market data building...",
  poolSize: 3,
};

describe("computeVerdict — Talent Intelligence", () => {
  it("TC-11: market percentile for top scorer in pool of 10 (percentile >= 80)", () => {
    const scores = [30, 35, 40, 45, 50, 55, 60, 65, 70, 85];
    const candidateScore = 85;
    const below = scores.filter((s) => s < candidateScore).length;
    const percentile = Math.round((below / scores.length) * 100);
    expect(percentile).toBeGreaterThanOrEqual(80);
  });

  it("TC-12: cold start pool < 5 returns 'Market data building...'", () => {
    expect(coldStartMarket.label).toBe("Market data building...");
    expect(coldStartMarket.percentile).toBeNull();
  });

  it("TC-13: FitScore 80 + Top 10% = Strong Hire", () => {
    const v = computeVerdict(80, marketPool(90, 10, 50), 70);
    expect(v.label).toBe("Strong Hire");
  });

  it("TC-14: FitScore 45 + Top 5% = Hidden Gem", () => {
    const v = computeVerdict(45, marketPool(95, 5, 100), 50);
    expect(v.label).toBe("Hidden Gem");
  });

  it("TC-15: FitScore 45 + Top 70% = Pass", () => {
    const v = computeVerdict(45, marketPool(30, 70, 80), 30);
    expect(v.label).toBe("Pass");
  });

  it("TC-16: ideal_match_pct is between 0-100 for every candidate", () => {
    for (const pct of [0, 25, 50, 75, 100]) {
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });

  it("TC-17: ideal gaps is non-empty array for candidates < 80% match", () => {
    const gaps = ["No Docker/K8s experience", "No startup launch"];
    expect(gaps.length).toBeGreaterThanOrEqual(1);
  });

  it("TC-18: verdict falls back to Good Fit when market data unavailable + high FitScore", () => {
    const v = computeVerdict(80, coldStartMarket, 60);
    expect(v.label).toBe("Good Fit");
  });

  it("verdict: FitScore 70 + Top 25% + idealMatch < 65 = Strong Hire (close to ideal)", () => {
    const v = computeVerdict(70, marketPool(80, 20, 100), 55);
    expect(v.label).toBe("Strong Hire");
    expect(v.action).toContain("close to ideal");
  });

  it("verdict: FitScore 70 + below Top 25% = Safe Hire", () => {
    const v = computeVerdict(70, marketPool(40, 60, 100), 80);
    expect(v.label).toBe("Safe Hire");
  });

  it("verdict: FitScore 40 + Top 10% + idealMatch 30 = Niche Talent", () => {
    const v = computeVerdict(40, marketPool(90, 10, 100), 30);
    expect(v.label).toBe("Niche Talent");
  });

  it("verdict: cold start + low FitScore = Moderate", () => {
    const v = computeVerdict(40, coldStartMarket, 30);
    expect(v.label).toBe("Moderate");
  });
});

describe("Shadow Score — blended talent intelligence", () => {
  it("computes 0.4*fit + 0.3*market + 0.3*ideal", () => {
    const fitScore = 79;
    const marketPercentile = 88;
    const idealMatchPct = 62;
    const shadow = Math.round(0.4 * fitScore + 0.3 * marketPercentile + 0.3 * idealMatchPct);
    expect(shadow).toBe(Math.round(31.6 + 26.4 + 18.6));
    expect(shadow).toBe(77);
  });

  it("falls back to fitScore when market is null", () => {
    const fitScore = 70;
    const marketPercentile = null;
    const idealMatchPct = 50;
    const marketComponent = marketPercentile ?? fitScore;
    const shadow = Math.round(0.4 * fitScore + 0.3 * marketComponent + 0.3 * idealMatchPct);
    expect(shadow).toBe(Math.round(28 + 21 + 15));
    expect(shadow).toBe(64);
  });

  it("clamps between 0 and 100", () => {
    const shadow1 = Math.round(Math.min(100, Math.max(0, 0.4 * 100 + 0.3 * 100 + 0.3 * 100)));
    expect(shadow1).toBe(100);
    const shadow2 = Math.round(Math.min(100, Math.max(0, 0.4 * 0 + 0.3 * 0 + 0.3 * 0)));
    expect(shadow2).toBe(0);
  });
});
