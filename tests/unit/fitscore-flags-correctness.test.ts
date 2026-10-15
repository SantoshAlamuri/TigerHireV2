/**
 * Regression tests for FitScore flags/score-flow correctness fixes:
 * 1. Flag dedupe happens BEFORE scoring (no double penalty for restated concerns).
 * 2. Directional flags ("Has A but lacks B" vs "Has B but lacks A") never merge.
 * 3. Weak-token-only pairs never merge via the Jaccard branch.
 * 4. Persisted ideal_gaps drops exact duplicates of red flags (index-based filter).
 * 5. Band label derives from the final ROUNDED score; verdict uses the same band threshold.
 */

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dedupeFlagObjects, dedupeFlags, flagsAreNearDuplicate } from "@/lib/fitscore/dedupe-flags";
import { computeHybridScore, fitLabelForScore } from "@/lib/fitscore/hybrid/engine";
import { computeVerdict } from "@/lib/fitscore/hybrid/verdict";
import { idealGapsExcludingRedFlagDupes, saveHybridFitScore } from "@/lib/fitscore/hybrid/persist";
import { calibrateScore } from "@/lib/scoring/calibrate";
import { DEFAULT_FIT_THRESHOLDS, DEFAULT_SCORE_FLOOR } from "@/lib/fitscore/hybrid/constants";
import type { MarketScore } from "@/lib/fitscore/hybrid/market-score";
import type { CandidateExtraction, FitThresholds } from "@/lib/fitscore/hybrid/types";

const thresholds: FitThresholds = { ...DEFAULT_FIT_THRESHOLDS };
const weights = { skill: 100 };

function extraction(over: Partial<CandidateExtraction> = {}): CandidateExtraction {
  return {
    candidate_name: "Test",
    total_years: 6,
    dimension_scores: { skill: 6 },
    certifications: [],
    quantified_impact: [],
    red_flags: [],
    green_flags: [],
    role_match_tag: "Backend Engineer",
    summary: "Backend engineer",
    ...over,
  };
}

const coldStartMarket: MarketScore = {
  percentile: null,
  topPct: null,
  label: "Market data building...",
  poolSize: 0,
};

describe("dedupe before scoring (dedupeFlagObjects + engine)", () => {
  const dupA = "No Kafka or any streaming/event-driven pipeline experience";
  const dupB = "No Kafka or streaming technology mentioned anywhere in resume";

  it("two near-duplicate critical red flags score the same as a single one", () => {
    const withDupes = extraction({
      red_flags: [
        { flag: dupA, severity: "critical" },
        { flag: dupB, severity: "critical" },
      ],
    });
    const deduped = {
      ...withDupes,
      red_flags: dedupeFlagObjects(withDupes.red_flags, 20),
      green_flags: dedupeFlags(withDupes.green_flags, 20),
    };
    const single = extraction({ red_flags: [{ flag: dupA, severity: "critical" }] });

    const rDeduped = computeHybridScore(deduped, weights, DEFAULT_SCORE_FLOOR, thresholds);
    const rSingle = computeHybridScore(single, weights, DEFAULT_SCORE_FLOOR, thresholds);
    expect(rDeduped.fitScore).toBe(rSingle.fitScore);
    expect(rDeduped.breakdown.redPenalty).toBe(rSingle.breakdown.redPenalty);

    // Sanity: without dedupe the duplicate would have been double-penalised.
    const rRaw = computeHybridScore(withDupes, weights, DEFAULT_SCORE_FLOOR, thresholds);
    expect(rRaw.breakdown.redPenalty).toBeGreaterThan(rSingle.breakdown.redPenalty);
  });

  it("keeps the FIRST occurrence's severity when merging duplicates", () => {
    const out = dedupeFlagObjects(
      [
        { flag: dupA, severity: "minor" },
        { flag: dupB, severity: "critical" },
      ],
      20,
    );
    expect(out).toHaveLength(1);
    expect(out[0].flag).toBe(dupA);
    expect(out[0].severity).toBe("minor");
  });

  it("also dedupes near-duplicate green flags", () => {
    const out = dedupeFlags(
      [
        "Strong Kafka streaming pipeline ownership at scale",
        "Strong Kafka streaming pipeline ownership demonstrated at scale",
      ],
      20,
    );
    expect(out).toHaveLength(1);
  });
});

describe("directional / weak-token merge guards", () => {
  it("does NOT merge directional pairs with swapped negation", () => {
    expect(
      flagsAreNearDuplicate("Has AWS but lacks GCP experience", "Has GCP but lacks AWS experience"),
    ).toBe(false);
    expect(
      dedupeFlags(["Has AWS but lacks GCP experience", "Has GCP but lacks AWS experience"]),
    ).toHaveLength(2);
  });

  it("does NOT merge pairs sharing only weak tokens on the Jaccard branch", () => {
    expect(flagsAreNearDuplicate("Manual QA testing only", "No QA test tooling experience")).toBe(
      false,
    );
  });

  it("still merges canonical paraphrase pairs (true positives preserved)", () => {
    expect(
      flagsAreNearDuplicate(
        "No Kafka or any streaming/event-driven pipeline experience",
        "No Kafka or streaming technology mentioned anywhere in resume",
      ),
    ).toBe(true);
    expect(
      flagsAreNearDuplicate(
        "Zero quantified metrics or measurable outcomes across all experience",
        "Zero quantified outcomes — pipeline scale, query performance gains, or data volume metrics absent",
      ),
    ).toBe(true);
    // One-sided negation phrasing differences must not block merges.
    expect(
      flagsAreNearDuplicate(
        "Active Scrum Master facilitation experience is absent for 7+ years; last SM role ended in 2017",
        "Scrum Master role experience is limited to ~2 years (2015-2017); the last 7+ years have been in director, founder, and portfolio management roles — not hands-on SM facilitation",
      ),
    ).toBe(true);
    // Long paraphrases of the same A/B-testing statistical-rigor gap (overlap below 0.6 jac branch).
    expect(
      flagsAreNearDuplicate(
        "A/B testing mentioned but lacks depth on statistical rigor (e.g., sample sizing, p-values, confidence intervals)",
        "A/B testing evidence lacks statistical methodology depth (no mention of significance testing, power analysis, or experimentation frameworks)",
      ),
    ).toBe(true);
  });
});

describe("idealGapsExcludingRedFlagDupes (persist-time ideal_gaps filter)", () => {
  it("drops an ideal gap that is an EXACT duplicate of a red flag", () => {
    const out = idealGapsExcludingRedFlagDupes(
      ["No Kubernetes experience"],
      ["No Kubernetes experience", "No Terraform experience"],
    );
    expect(out).toEqual(["No Terraform experience"]);
  });

  it("drops an ideal gap that rewords a red flag", () => {
    const out = idealGapsExcludingRedFlagDupes(
      ["No Kafka or any streaming/event-driven pipeline experience"],
      ["No Kafka or streaming technology mentioned anywhere in resume", "No Terraform experience"],
    );
    expect(out).toEqual(["No Terraform experience"]);
  });

  it("keeps all ideal gaps when none duplicate a red flag", () => {
    const out = idealGapsExcludingRedFlagDupes(
      ["No Kubernetes experience"],
      ["No Terraform experience", "No GraphQL experience"],
    );
    expect(out).toEqual(["No Terraform experience", "No GraphQL experience"]);
  });

  it("dedupes within the ideal gaps themselves", () => {
    const out = idealGapsExcludingRedFlagDupes(
      [],
      ["No Terraform experience", "no terraform experience", "No GraphQL experience"],
    );
    expect(out).toEqual(["No Terraform experience", "No GraphQL experience"]);
  });
});

describe("saveHybridFitScore persists amber watch-items (verify-with-candidate)", () => {
  function makeAdmin(inserted: Record<string, unknown>[]): SupabaseClient {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;
  }

  it("writes evidence amber_flags to the amber_flags column, deduped against red flags", async () => {
    const inserted: Record<string, unknown>[] = [];
    const { breakdown } = computeHybridScore(
      extraction(),
      weights,
      DEFAULT_SCORE_FLOOR,
      thresholds,
    );
    await saveHybridFitScore(makeAdmin(inserted), {
      job_id: "job-1",
      candidate_id: "cand-1",
      overall_score: 70,
      band: "Good Fit",
      extraction: extraction({
        red_flags: [{ flag: "No production Kubernetes experience", severity: "moderate" }],
      }),
      explanation: "Solid backend profile.",
      evidence: {
        quotes: [],
        amber_flags: [
          "Possible employment gap Mar 2021-Jan 2022 - verify with candidate",
          "No production Kubernetes experience",
        ],
      },
      breakdown,
      confidence: { score: 70, band: "medium" },
      is_test_run: true,
      jd_base_document_id: "jdb-1",
      jd_base_version: 1,
      rubric_snapshot: {} as never,
    });
    expect(inserted).toHaveLength(1);
    // The red-flag restatement is dropped; the genuinely uncertain watch-item survives.
    expect(inserted[0].amber_flags).toEqual([
      "Possible employment gap Mar 2021-Jan 2022 - verify with candidate",
    ]);
  });

  it("persists an empty amber_flags array when the verdict emitted none", async () => {
    const inserted: Record<string, unknown>[] = [];
    const { breakdown } = computeHybridScore(
      extraction(),
      weights,
      DEFAULT_SCORE_FLOOR,
      thresholds,
    );
    await saveHybridFitScore(makeAdmin(inserted), {
      job_id: "job-1",
      candidate_id: "cand-1",
      overall_score: 70,
      band: "Good Fit",
      extraction: extraction(),
      explanation: "Solid backend profile.",
      evidence: { quotes: [] },
      breakdown,
      confidence: { score: 70, band: "medium" },
      is_test_run: true,
      jd_base_document_id: "jdb-1",
      jd_base_version: 1,
      rubric_snapshot: {} as never,
    });
    expect(inserted[0].amber_flags).toEqual([]);
  });
});

describe("band label from final rounded score", () => {
  it("engine: raw 59.6 rounds to 60 and gets the Good Fit band (label matches returned score)", () => {
    // skill 5.56/10 × 100 = 55.6, + 2 green flags × 2 = 4 → 59.6 raw → 60 rounded.
    const ext = extraction({
      dimension_scores: { skill: 5.56 },
      green_flags: ["Strong Kafka streaming ownership", "Led zero-downtime cloud migration"],
    });
    const r = computeHybridScore(ext, weights, DEFAULT_SCORE_FLOOR, thresholds);
    expect(r.fitScore).toBe(60);
    expect(r.fitLabel).toBe("Good Fit");
    expect(fitLabelForScore(r.fitScore, thresholds)).toBe(r.fitLabel);
  });

  it("calibrated displayed score and its band always agree (Haiku offset case)", () => {
    const displayed = calibrateScore(60, "claude-haiku-4-5");
    expect(displayed).toBe(59); // 60 - 1.5 → 58.5 → rounds to 59
    expect(fitLabelForScore(displayed, thresholds)).toBe("Moderate Fit");
    // No drift: the band for what's shown is computed from the same rounded number.
    expect(fitLabelForScore(calibrateScore(61, "claude-haiku-4-5"), thresholds)).toBe("Good Fit");
  });
});

describe("verdict/band boundary coherence (cold-start branch)", () => {
  it("score exactly at thresholds.good is 'high' for both band and verdict", () => {
    const v = computeVerdict(thresholds.good, coldStartMarket, 50, thresholds);
    expect(v.label).toBe("Good Fit");
    expect(fitLabelForScore(thresholds.good, thresholds)).toBe("Good Fit");
  });

  it("score one below thresholds.good is 'low' for both band and verdict", () => {
    const v = computeVerdict(thresholds.good - 1, coldStartMarket, 50, thresholds);
    expect(v.label).toBe("Moderate");
    expect(fitLabelForScore(thresholds.good - 1, thresholds)).toBe("Moderate Fit");
  });

  it("respects custom JD Base thresholds instead of a hardcoded 65", () => {
    const custom: FitThresholds = { strong: 85, good: 70, moderate: 50, weak: 30 };
    // 65 was 'high' under the old hardcoded cutoff; with good=70 it must be low.
    expect(computeVerdict(65, coldStartMarket, 50, custom).label).toBe("Moderate");
    expect(fitLabelForScore(65, custom)).toBe("Moderate Fit");
    // And 62 (below old hardcoded 65) is high when the JD says good=60.
    expect(computeVerdict(62, coldStartMarket, 50, thresholds).label).toBe("Good Fit");
  });

  it("defaults to DEFAULT_FIT_THRESHOLDS when thresholds are not passed", () => {
    expect(computeVerdict(DEFAULT_FIT_THRESHOLDS.good, coldStartMarket, 50).label).toBe("Good Fit");
  });
});
