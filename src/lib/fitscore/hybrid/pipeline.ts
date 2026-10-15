/**
 * End-to-end hybrid FitScore v2 pipeline with talent intelligence delta.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CandidateData, JobData } from "@/lib/fitscore/types";
import { buildScoreInput } from "@/lib/fitscore/score-input-helpers";
import { buildJdText } from "@/lib/fitscore/job-text";
import { isDeterministicFallbackEnabled } from "@/lib/fitscore/resume-parse-config";
import { buildDeterministicFallbackScore } from "./deterministic-fallback";
import { candidateExtractionSchema } from "@/lib/validations/fitscore-hybrid";
import { isPathUnificationEnabled } from "@/lib/feature-flags/cascade";
import { selectRubric } from "./select-rubric";
import {
  resolveHybridExtractionModelWithTier,
  resolveUseMergedExtractionPath,
} from "@/lib/fitscore/resolve-scoring-models";
import { calibrateScore } from "@/lib/scoring/calibrate";
import { dedupeFlagObjects, dedupeFlags } from "@/lib/fitscore/dedupe-flags";
import { computeHybridScore, fitLabelForScore } from "./engine";
import { FIT_LABEL_COLORS } from "./constants";
import { computeFitScoreBlendV2 } from "./blend-v2";
import { isFitScoreBlendV2Enabled } from "./blend-v2-flag";
import { computeFitScoreV5 } from "./engine-v5";
import { isFitScoreV5Enabled } from "./v5-flag";
import type { ShadowBlend, FitScoreV5Blend } from "./types";
import { buildExtractionSignalsLog } from "./extraction-signals-log";
import {
  buildBasicVerdictLead,
  buildVerdictLeadFromScores,
  runHybridExtractionAndVerdict,
} from "./extraction-and-verdict";
import { runHybridExtraction } from "./extraction";
import { runVerdictExplanation, runHybridExplanation } from "./explanation";
import { getJdBaseByJobId } from "./jd-base";
import { parseHybridExtractionJson } from "./json-parser";
import { computeMarketScore } from "./market-score";
import { advancePipelineToFitScoreReviewAfterScoring } from "@/lib/pipeline/advance-after-fitscore";
import { buildHybridJdBaseRubricSnapshot } from "./rubric-snapshot";
import { saveHybridFitScore } from "./persist";
import { computeVerdict } from "./verdict";
import { fetchApplicationCompletenessBonus } from "./application-confidence-boost";
import { computeHybridConfidence } from "./confidence";
import type {
  CandidateExtraction,
  HybridEvidenceJson,
  HybridScoreResult,
  JDBaseDocument,
} from "./types";
import { HybridFitScoreError } from "./errors";
import {
  beginFitScoreScoringDiagnostic,
  endFitScoreScoringDiagnostic,
  logFitScorePipelineStage,
} from "@/lib/fitscore/scoring-diagnostic";
import type { FitScoreScoringSource } from "@/lib/fitscore/scoring-source";
import { logger } from "@/lib/observability/logger";
import { recordFitScoreObservabilityEvent } from "@/lib/fitscore/scoring-observability";
export { HybridFitScoreError } from "./errors";

/**
 * True when the extraction carries no usable dimension score for ANY weighted dimension.
 * The zod schema's `.catch({})` replaces a malformed dimension_scores map with `{}`; scoring
 * that against real weights floors every dimension to 1/10 and silently produces a
 * "Not a Fit" — this guard routes such extractions to the deterministic fallback instead.
 */
function extractionMissingAllDimensionScores(
  extraction: CandidateExtraction,
  weights: JDBaseDocument["weights"],
): boolean {
  const expected = Object.keys(weights).filter(
    (k) => typeof weights[k] === "number" && weights[k] > 0,
  );
  if (expected.length === 0) return false;
  const dims = extraction.dimension_scores;
  if (!dims || typeof dims !== "object") return true;
  return !expected.some((k) => typeof dims[k] === "number" && Number.isFinite(dims[k]));
}

export async function runHybridFitScorePipeline(
  admin: SupabaseClient,
  params: {
    job: JobData;
    candidate: CandidateData;
    jdBase?: JDBaseDocument | null;
    saveToDb?: boolean;
    isTestRun?: boolean;
    /**
     * Precomputed hireability + screening bonus (batch path). When omitted, loads from
     * `applications` + `application_screening_answers` for this job/candidate pair.
     */
    applicationCompletenessBonus?: number;
    scoringSource?: FitScoreScoringSource;
    /** When true, skip LLM explanation (tryout fast path — score card first). */
    skipExplanation?: boolean;
  },
): Promise<HybridScoreResult> {
  const { job, candidate } = params;
  const jdBase = params.jdBase ?? (await getJdBaseByJobId(admin, job.id));
  if (!jdBase) {
    throw new HybridFitScoreError(
      "No JD Base document for this job. Generate one via POST /api/fitscore/jd-base.",
      "no_jd_base",
    );
  }
  if (!jdBase.approvedBy) {
    throw new HybridFitScoreError(
      "JD Base awaiting hiring manager approval. Review weights and approve before scoring.",
      "jd_base_not_approved",
    );
  }

  const pathUnification = await isPathUnificationEnabled(job.organisation_id);
  if (pathUnification) {
    selectRubric(buildJdText(job));
  }

  const { model: extractionModel, scoringTier } = await resolveHybridExtractionModelWithTier({
    organisationId: job.organisation_id,
    scoringSource: params.scoringSource,
    ctcBand: jdBase.structuredJd?.role_basics?.ctc_band ?? null,
  });

  const attribution = {
    jobId: job.id,
    candidateId: candidate.id,
    organisationId: job.organisation_id,
    scoringSource: params.scoringSource,
    extractionModel,
  } as const;

  beginFitScoreScoringDiagnostic(job.id, candidate.id);
  try {
    const mergedPath = await resolveUseMergedExtractionPath({
      organisationId: job.organisation_id,
      scoringSource: params.scoringSource,
    });
    logFitScorePipelineStage("pipeline_start", {
      merged_path: mergedPath,
      path_unification: pathUnification,
      extraction_model: extractionModel,
    });

    // Step 1-2: Extract + parse (optional single-call extraction + verdict narrative)
    logFitScorePipelineStage("build_score_input");
    const scoreInput = await buildScoreInput(admin, job.id, job, candidate.id, candidate, {
      scoringSource: params.scoringSource,
    });
    logFitScorePipelineStage("build_score_input_done", {
      parse_method: scoreInput.parse_method,
      resume_chars: scoreInput.resume_text.length,
    });

    let extraction: CandidateExtraction;
    let mergedVerdictBody: string | null = null;
    let mergedEvidence: HybridEvidenceJson | null = null;
    let scoringMethod: string = mergedPath ? "hybrid_merged" : "hybrid";

    if (mergedPath) {
      logFitScorePipelineStage("hybrid_extraction_and_verdict");
      try {
        const merged = await runHybridExtractionAndVerdict(
          jdBase,
          scoreInput.resume_text,
          attribution,
        );
        extraction = merged.extraction;
        mergedVerdictBody = merged.verdictWhyBody;
        mergedEvidence = merged.evidence;
      } catch (err) {
        if (
          isDeterministicFallbackEnabled() &&
          err instanceof HybridFitScoreError &&
          err.code === "merged_extraction_verdict_failed"
        ) {
          logFitScorePipelineStage("deterministic_fallback");
          const fb = buildDeterministicFallbackScore({
            jdBase,
            resumeText: scoreInput.resume_text,
            candidateName: candidate.name ?? candidate.full_name,
            rawLlmText: err.rawLlmText,
            jobId: job.id,
            candidateId: candidate.id,
          });
          extraction = fb.extraction;
          mergedVerdictBody = fb.verdictWhyBody;
          mergedEvidence = fb.evidence;
          scoringMethod = "deterministic_fallback";
        } else {
          throw err;
        }
      }
    } else {
      if (pathUnification) {
        throw new HybridFitScoreError(
          "Legacy split extraction path is blocked when ff_path_unification is enabled",
          "extraction_invalid",
        );
      }
      logFitScorePipelineStage("hybrid_extraction");
      try {
        const { text: rawExtraction } = await runHybridExtraction(
          jdBase,
          scoreInput.resume_text,
          attribution,
        );

        const parsed = parseHybridExtractionJson(rawExtraction);
        if (!parsed.ok) {
          throw new HybridFitScoreError(
            parsed.error + (parsed.rawSnippet ? `: ${parsed.rawSnippet}` : ""),
            "extraction_parse",
            rawExtraction,
          );
        }

        const zod = candidateExtractionSchema.safeParse(parsed.data);
        if (!zod.success) {
          throw new HybridFitScoreError(
            `Extraction JSON failed validation: ${zod.error.message}`,
            "extraction_invalid",
          );
        }
        extraction = zod.data;
      } catch (err) {
        if (
          isDeterministicFallbackEnabled() &&
          err instanceof HybridFitScoreError &&
          (err.code === "extraction_parse" || err.code === "extraction_invalid")
        ) {
          logFitScorePipelineStage("deterministic_fallback");
          const fb = buildDeterministicFallbackScore({
            jdBase,
            resumeText: scoreInput.resume_text,
            candidateName: candidate.name ?? candidate.full_name,
            rawLlmText: err.rawLlmText,
            jobId: job.id,
            candidateId: candidate.id,
          });
          extraction = fb.extraction;
          mergedVerdictBody = fb.verdictWhyBody;
          mergedEvidence = fb.evidence;
          scoringMethod = "deterministic_fallback";
        } else {
          throw err;
        }
      }
    }

    // Step 2.4: Guard — a malformed LLM dimension_scores map (wiped to {} by schema
    // coercion) must NEVER be scored: every weighted dimension would default to 1/10 and a
    // strong candidate would silently persist as "Not a Fit". Route to the deterministic
    // fallback (same trigger pattern as parse/validation failures) instead.
    if (
      scoringMethod !== "deterministic_fallback" &&
      extractionMissingAllDimensionScores(extraction, jdBase.weights)
    ) {
      logger.warn(
        JSON.stringify({
          type: "fitscore_empty_dimension_scores",
          job_id: job.id,
          candidate_id: candidate.id,
          weighted_dimensions: Object.keys(jdBase.weights).length,
        }),
      );
      recordFitScoreObservabilityEvent({
        eventType: "fitscore_empty_dimension_scores",
        jobId: job.id,
        candidateId: candidate.id,
        metadata: { scoring_method: scoringMethod },
      });
      if (!isDeterministicFallbackEnabled()) {
        throw new HybridFitScoreError(
          "Extraction returned no dimension scores for the weighted dimensions — refusing to score an all-floor map.",
          "extraction_invalid",
        );
      }
      logFitScorePipelineStage("deterministic_fallback_empty_dimensions");
      const fb = buildDeterministicFallbackScore({
        jdBase,
        resumeText: scoreInput.resume_text,
        candidateName: candidate.name ?? candidate.full_name,
        jobId: job.id,
        candidateId: candidate.id,
      });
      extraction = fb.extraction;
      mergedVerdictBody = fb.verdictWhyBody;
      mergedEvidence = fb.evidence;
      scoringMethod = "deterministic_fallback";
    }

    // Step 2.5: Dedupe near-duplicate flags BEFORE scoring so a restated concern isn't
    // double-penalised (red) or double-credited (green). First occurrence wins, including
    // its severity. Persist re-runs the same dedupe as a harmless defensive no-op.
    extraction = {
      ...extraction,
      red_flags: dedupeFlagObjects(extraction.red_flags ?? [], 20),
      green_flags: dedupeFlags(extraction.green_flags ?? [], 20),
    };

    // Step 3: Deterministic scoring
    logFitScorePipelineStage("deterministic_scoring");
    const { fitScore, fitLabelColor, breakdown } = computeHybridScore(
      extraction,
      jdBase.weights,
      jdBase.scoreFloor,
      jdBase.fitThresholds,
    );

    // Step 4: Ideal match (from extraction if available)
    const idealMatchPct = extraction.ideal_match_pct ?? 0;
    const idealGaps = extraction.ideal_gaps ?? [];

    // Step 4.5: Blend + cross-model calibration FIRST — the calibrated rounded score is the
    // single number used for display, market ranking, verdict, band, and persistence.
    // (The market pool ranks against persisted overall_score values, which are themselves
    // calibrated — so the candidate score entering the pool must be calibrated too.)
    const blendV2Enabled = await isFitScoreBlendV2Enabled(job.organisation_id);
    const blendV2 = blendV2Enabled ? computeFitScoreBlendV2(fitScore, breakdown) : null;
    const rawDisplayed = blendV2?.primaryScore ?? fitScore;
    const displayedScore = calibrateScore(rawDisplayed, extractionModel);
    // Band label always derives from the FINAL rounded calibrated score, so the persisted
    // band matches the displayed number regardless of blend/calibration offsets.
    const displayLabel = fitLabelForScore(displayedScore, jdBase.fitThresholds);
    const displayLabelColor = FIT_LABEL_COLORS[displayLabel] ?? fitLabelColor;

    // Step 5: Market score — calibrated score vs pool of calibrated persisted scores
    logFitScorePipelineStage("market_score");
    const market = await computeMarketScore(displayedScore, job.id, admin, {
      organisationId: job.organisation_id,
      candidateId: candidate.id,
    });

    // Step 6: Verdict — same calibrated score + the JD Base band thresholds, so the verdict
    // agrees with the band chip at the "good" boundary.
    const verdict = computeVerdict(displayedScore, market, idealMatchPct, jdBase.fitThresholds);

    // Step 6.5: Deterministic confidence signal (separate axis from fit score)
    const applicationCompletenessBonus =
      params.applicationCompletenessBonus !== undefined
        ? params.applicationCompletenessBonus
        : await fetchApplicationCompletenessBonus(admin, job.id, candidate.id);

    const confidence = computeHybridConfidence(extraction, {
      resumeText: scoreInput.resume_text,
      extractionUsedVisionFallback: scoreInput.parse_method === "vision",
      resumeTruncated: scoreInput.resume_text.length > 120_000,
      applicationCompletenessBonus,
    });

    // Step 7: Verdict-aware explanation (merged single-call path vs legacy two-call)
    let explanation: string;
    let evidence: HybridEvidenceJson;
    const buildMergedExplanation = (): string => {
      const useRich = Boolean(jdBase.idealCandidateProfile) || market.percentile !== null;
      const lead = useRich
        ? buildVerdictLeadFromScores({
            fitScore: displayedScore,
            fitLabel: displayLabel,
            verdict,
            market,
            idealMatchPct,
            idealGaps,
            breakdown,
          })
        : buildBasicVerdictLead({ fitScore: displayedScore, fitLabel: displayLabel, breakdown });
      const body = mergedVerdictBody?.trim() ?? "";
      return body ? `${lead}\n\n${body}` : lead;
    };

    if (params.skipExplanation) {
      if (mergedPath && mergedEvidence) {
        logFitScorePipelineStage("explanation_from_merged_tryout");
        explanation = buildMergedExplanation();
        evidence = mergedEvidence;
      } else if (scoringMethod === "deterministic_fallback") {
        logFitScorePipelineStage("explanation_deterministic_fallback");
        explanation = buildMergedExplanation();
        evidence = mergedEvidence ?? { quotes: [] };
      } else if (extraction.summary?.trim()) {
        logFitScorePipelineStage("explanation_from_extraction_summary");
        explanation = extraction.summary.trim();
        evidence = { quotes: [] };
      } else {
        logFitScorePipelineStage("explanation_skipped_tryout");
        explanation = "";
        evidence = { quotes: [] };
      }
    } else if (mergedPath && mergedEvidence) {
      logFitScorePipelineStage("explanation_skipped_merged_path");
      const useRich = Boolean(jdBase.idealCandidateProfile) || market.percentile !== null;
      const lead = useRich
        ? buildVerdictLeadFromScores({
            fitScore: displayedScore,
            fitLabel: displayLabel,
            verdict,
            market,
            idealMatchPct,
            idealGaps,
            breakdown,
          })
        : buildBasicVerdictLead({ fitScore: displayedScore, fitLabel: displayLabel, breakdown });
      const body = mergedVerdictBody?.trim() ?? "";
      explanation = body ? `${lead}\n\n${body}` : lead;
      evidence = mergedEvidence;
    } else if (scoringMethod === "deterministic_fallback") {
      logFitScorePipelineStage("explanation_deterministic_fallback");
      const lead = buildBasicVerdictLead({
        fitScore: displayedScore,
        fitLabel: displayLabel,
        breakdown,
      });
      const body = mergedVerdictBody?.trim() ?? "";
      explanation = body ? `${lead}\n\n${body}` : lead;
      evidence = mergedEvidence ?? { quotes: [] };
    } else if (pathUnification) {
      throw new HybridFitScoreError(
        "Legacy hybrid/verdict explanation path is blocked when ff_path_unification is enabled",
        "extraction_invalid",
      );
    } else if (jdBase.idealCandidateProfile || market.percentile !== null) {
      logFitScorePipelineStage("verdict_explanation");
      const explanationResult = await runVerdictExplanation({
        jdBase,
        extraction,
        fitScore: displayedScore,
        market,
        verdictLabel: verdict.label,
        idealMatchPct,
        idealGaps,
        breakdown,
        resumeText: scoreInput.resume_text,
        attribution,
      });
      explanation = explanationResult.text;
      evidence = explanationResult.evidence;
    } else {
      logFitScorePipelineStage("hybrid_explanation");
      const explanationResult = await runHybridExplanation({
        jdBase,
        extraction,
        fitScore: displayedScore,
        fitLabel: displayLabel,
        breakdown,
        resumeText: scoreInput.resume_text,
        attribution,
      });
      explanation = explanationResult.text;
      evidence = explanationResult.evidence;
    }

    const idealMatch = { ideal_match_pct: idealMatchPct, ideal_gaps: idealGaps };

    // Step 8: Shadow score.
    // When fitscore_v5 is enabled, the shadow slot carries the v5 "outcomes-weighted" score so it
    // can be compared against the live v2 primary before any promotion (shadow-first rollout — v5
    // never changes overall_score here). Otherwise it carries the legacy TriBlend comparison
    // (fit/market/ideal) kept from the 25/75 rollout.
    let shadowScore: number;
    let shadowBlend: ShadowBlend | FitScoreV5Blend;
    const v5Enabled = await isFitScoreV5Enabled(job.organisation_id);
    if (v5Enabled) {
      const v5 = computeFitScoreV5(extraction, breakdown, jdBase.scoreFloor, jdBase.fitThresholds);
      shadowScore = v5.score;
      shadowBlend = v5.blend;
    } else {
      const SHADOW_WEIGHTS = { fit: 0.4, market: 0.3, ideal: 0.3 };
      const marketComponent = market.percentile ?? fitScore;
      const shadowRaw =
        SHADOW_WEIGHTS.fit * fitScore +
        SHADOW_WEIGHTS.market * marketComponent +
        SHADOW_WEIGHTS.ideal * idealMatchPct;
      shadowScore = Math.round(Math.min(100, Math.max(0, shadowRaw)));
      shadowBlend = {
        fitScore,
        marketPercentile: market.percentile,
        idealMatchPct,
        weights: SHADOW_WEIGHTS,
      };
    }

    const signalsLog = buildExtractionSignalsLog({
      extraction,
      idealProfile: jdBase.idealCandidateProfile ?? null,
      resumeText: scoreInput.resume_text,
    });

    const result: HybridScoreResult = {
      fitScore: displayedScore,
      fitLabel: displayLabel,
      fitLabelColor: displayLabelColor,
      extraction,
      explanation,
      evidence,
      breakdown,
      confidence,
      market,
      idealMatch,
      verdict,
      shadowScore,
      shadowBlend,
      engineFitScore: fitScore,
      primaryScore: blendV2?.primaryScore ?? null,
      primaryBlend: blendV2?.primaryBlend ?? null,
      signalsLog: signalsLog as unknown as Record<string, unknown>,
    };

    // Step 9: Persist all fields
    if (params.saveToDb !== false) {
      logFitScorePipelineStage("persist");
      const rubricSnapshot = buildHybridJdBaseRubricSnapshot(jdBase);
      await saveHybridFitScore(admin, {
        job_id: job.id,
        candidate_id: candidate.id,
        overall_score: displayedScore,
        band: displayLabel,
        extraction,
        explanation,
        evidence,
        breakdown,
        confidence,
        is_test_run: params.isTestRun,
        ideal_match_pct: idealMatchPct,
        ideal_gaps: idealGaps,
        market_percentile: market.percentile,
        market_pool_size: market.poolSize,
        market_label: market.label,
        verdict: verdict.label,
        verdict_action: verdict.action,
        primary_score: blendV2?.primaryScore ?? null,
        primary_blend: blendV2?.primaryBlend ?? null,
        shadow_score: shadowScore,
        shadow_blend: shadowBlend as unknown as Record<string, unknown>,
        signals_log: signalsLog as unknown as Record<string, unknown>,
        scoring_method: scoringMethod,
        model_used: extractionModel,
        scoring_tier: scoringTier ?? null,
        jd_base_document_id: jdBase.id,
        jd_base_version: jdBase.version ?? 1,
        rubric_snapshot: rubricSnapshot,
      });

      if (params.scoringSource !== "tryout") {
        await advancePipelineToFitScoreReviewAfterScoring(admin, {
          jobId: job.id,
          candidateId: candidate.id,
          organisationId: job.organisation_id,
          isTestRun: params.isTestRun,
        });
      } else {
        logFitScorePipelineStage("pipeline_advance_skipped_tryout");
      }
    }

    logFitScorePipelineStage("pipeline_complete", { fit_score: displayedScore });
    return result;
  } finally {
    endFitScoreScoringDiagnostic();
  }
}
