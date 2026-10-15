/**
 * Pipeline wiring tests for the corrected hybrid score flow:
 *   extraction → flag dedupe → engine → blend/calibrate → market/verdict/band → persist payload.
 *
 * Asserts:
 * - red/green flags are deduped BEFORE the deterministic engine runs (no double penalty);
 * - computeMarketScore receives the CALIBRATED displayed score (same scale as the
 *   persisted overall_score pool it ranks against);
 * - verdict, band, and displayed score are all derived from the same calibrated number
 *   using the JD Base fit thresholds (coherent at the "good" boundary, cold-start branch).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/observability/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { logger: { ...noop, child: vi.fn(() => noop) } };
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn() };
  },
}));

vi.mock("@/lib/fitscore/score-input-helpers", () => ({
  buildScoreInput: vi.fn(async () => ({
    resume_text: "Backend engineer resume text",
    parse_method: "text",
  })),
}));

vi.mock("@/lib/feature-flags/cascade", () => ({
  isPathUnificationEnabled: vi.fn(async () => false),
}));

vi.mock("@/lib/fitscore/resolve-scoring-models", () => ({
  resolveHybridExtractionModelWithTier: vi.fn(async () => ({
    model: "claude-haiku-4-5",
    scoringTier: "value",
  })),
  resolveUseMergedExtractionPath: vi.fn(async () => true),
}));

vi.mock("@/lib/fitscore/hybrid/blend-v2-flag", () => ({
  isFitScoreBlendV2Enabled: vi.fn(async () => false),
}));

vi.mock("@/lib/fitscore/hybrid/market-score", () => ({
  computeMarketScore: vi.fn(),
}));

vi.mock("@/lib/fitscore/scoring-observability", () => ({
  recordFitScoreObservabilityEvent: vi.fn(),
}));

vi.mock("@/lib/fitscore/hybrid/extraction-and-verdict", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, runHybridExtractionAndVerdict: vi.fn() };
});

import { runHybridFitScorePipeline } from "@/lib/fitscore/hybrid/pipeline";
import { runHybridExtractionAndVerdict } from "@/lib/fitscore/hybrid/extraction-and-verdict";
import { computeMarketScore } from "@/lib/fitscore/hybrid/market-score";
import { fitLabelForScore } from "@/lib/fitscore/hybrid/engine";
import { recordFitScoreObservabilityEvent } from "@/lib/fitscore/scoring-observability";
import { candidateExtractionSchema } from "@/lib/validations/fitscore-hybrid";
import type { CandidateExtraction, JDBaseDocument } from "@/lib/fitscore/hybrid/types";
import type { CandidateData, JobData } from "@/lib/fitscore/types";

const mergedMock = vi.mocked(runHybridExtractionAndVerdict);
const marketMock = vi.mocked(computeMarketScore);

const admin = {} as unknown as SupabaseClient;

const jdBase = {
  id: "jd-1",
  jobId: "job-1",
  roleTitle: "Backend Engineer",
  company: "Acme",
  context: "",
  weights: { skill: 100 },
  scoreFloor: 15,
  fitThresholds: { strong: 78, good: 60, moderate: 40, weak: 25 },
  approvedBy: "user-1",
  approvedAt: "2026-01-01T00:00:00.000Z",
  idealCandidateProfile: null,
  structuredJd: null,
  version: 1,
} as unknown as JDBaseDocument;

const job = { id: "job-1", organisation_id: "org-1", title: "Backend Engineer" } as JobData;
const candidate = { id: "cand-1", name: "Test Candidate" } as CandidateData;

function extraction(over: Partial<CandidateExtraction> = {}): CandidateExtraction {
  return {
    candidate_name: "Test Candidate",
    total_years: 6,
    dimension_scores: { skill: 6 },
    certifications: [],
    quantified_impact: [],
    red_flags: [],
    green_flags: [],
    role_match_tag: "Backend Engineer",
    summary: "Backend engineer summary.",
    ideal_match_pct: 50,
    ideal_gaps: [],
    ...over,
  };
}

function runPipeline(ext: CandidateExtraction) {
  mergedMock.mockResolvedValue({
    extraction: ext,
    verdictWhyBody: "Why body.",
    evidence: { quotes: [] },
  } as never);
  return runHybridFitScorePipeline(admin, {
    job,
    candidate,
    jdBase,
    saveToDb: false,
    applicationCompletenessBonus: 0,
    skipExplanation: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  marketMock.mockResolvedValue({
    percentile: null,
    topPct: null,
    label: "Market data building...",
    poolSize: 0,
  });
});

describe("hybrid pipeline score flow", () => {
  it("dedupes duplicate red flags before scoring and feeds the calibrated score everywhere", async () => {
    // skill 6/10 × 100 = 60 raw; ONE critical flag after dedupe → -5 → engine 55.
    // Haiku calibration: 55 - 1.5 = 53.5 → displayed 54.
    const result = await runPipeline(
      extraction({
        red_flags: [
          {
            flag: "No Kafka or any streaming/event-driven pipeline experience",
            severity: "critical",
          },
          {
            flag: "No Kafka or streaming technology mentioned anywhere in resume",
            severity: "critical",
          },
        ],
      }),
    );

    // Dedupe happened BEFORE the engine: single penalty (55), not double (50).
    expect(result.extraction.red_flags).toHaveLength(1);
    expect(result.extraction.red_flags[0].flag).toBe(
      "No Kafka or any streaming/event-driven pipeline experience",
    );
    expect(result.engineFitScore).toBe(55);
    expect(result.breakdown.redPenalty).toBe(5);

    // Displayed score is the calibrated engine score.
    expect(result.fitScore).toBe(54);

    // Market ranking received the SAME calibrated score that gets persisted/displayed,
    // scoped to the candidate's own organisation with the candidate excluded from the pool.
    expect(marketMock).toHaveBeenCalledTimes(1);
    expect(marketMock.mock.calls[0][0]).toBe(54);
    expect(marketMock.mock.calls[0][3]).toEqual({
      organisationId: "org-1",
      candidateId: "cand-1",
    });

    // Band derives from the displayed score, and verdict agrees (cold start, below good).
    expect(result.fitLabel).toBe(fitLabelForScore(result.fitScore, jdBase.fitThresholds));
    expect(result.fitLabel).toBe("Moderate Fit");
    expect(result.verdict.label).toBe("Moderate");
  });

  it("keeps verdict, band, and displayed score coherent exactly at thresholds.good (cold start)", async () => {
    // skill 6.1/10 × 100 = 61 → engine 61; Haiku: 61 - 1.5 = 59.5 → displayed 60 = good boundary.
    const result = await runPipeline(extraction({ dimension_scores: { skill: 6.1 } }));

    expect(result.engineFitScore).toBe(61);
    expect(result.fitScore).toBe(60);
    expect(marketMock.mock.calls[0][0]).toBe(60);
    expect(result.fitLabel).toBe("Good Fit");
    expect(result.verdict.label).toBe("Good Fit"); // cold-start high branch — matches band chip
  });

  it("scores a candidate one point below the boundary as low on BOTH band and verdict", async () => {
    // skill 6/10 × 100 = 60 → engine 60; Haiku: 58.5 → displayed 59 (below good=60).
    const result = await runPipeline(extraction());

    expect(result.engineFitScore).toBe(60);
    expect(result.fitScore).toBe(59);
    expect(result.fitLabel).toBe("Moderate Fit");
    expect(result.verdict.label).toBe("Moderate");
  });

  it("routes a null/malformed dimension_scores map to the deterministic fallback, never an all-1s score", async () => {
    // The schema's `.catch({})` turns dimension_scores=null into {} — reproduce that exact path.
    const parsed = candidateExtractionSchema.parse({
      ...extraction(),
      dimension_scores: null,
    });
    expect(parsed.dimension_scores).toEqual({});

    const result = await runPipeline(parsed);

    // Deterministic fallback took over (keyword-signal dims), NOT the floored all-1s map.
    expect(result.extraction.role_match_tag).toBe("deterministic_fallback");
    expect(result.breakdown.dimensions.skill.value).toBeGreaterThan(1);
    // All-1s would have been engine 15 (floor); fallback keyword default is 3/10 → engine 30.
    expect(result.engineFitScore).toBe(30);
    expect(result.fitScore).toBe(29); // Haiku calibration 30 - 1.5 → 28.5 → 29

    // Warning event fired for observability.
    expect(vi.mocked(recordFitScoreObservabilityEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "fitscore_empty_dimension_scores" }),
    );
  });
});
