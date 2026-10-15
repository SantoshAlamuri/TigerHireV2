import type { SupabaseClient } from "@supabase/supabase-js";
import pLimit from "p-limit";
import { FitScoreRepository } from "@/lib/repositories/FitScoreRepository";
import { JobRepository } from "@/lib/repositories/JobRepository";
import {
  getJdBaseByJobId,
  prefetchApplicationCompletenessBonusesForJob,
  runHybridFitScorePipeline,
} from "@/lib/fitscore/hybrid";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { recordScoringPathMetric } from "@/lib/fitscore/observability/scoring-metrics";
import { recordPlatformCostEvent } from "@/lib/costs/ledger";
import {
  enqueuePendingJdApprovalPair,
  enqueuePendingJdApprovalPairs,
  JD_BASE_NOT_APPROVED_MESSAGE,
} from "@/lib/fitscore/pending-jd-approval";
import type { FitScoreScoringSource } from "@/lib/fitscore/scoring-source";
import { checkScoringGuard as checkPrescreenGate } from "@/lib/prescreen/scoring-guard";
import {
  evaluateCanonicalScreeningGate,
  recordCanonicalGateStatus,
} from "@/lib/screening/canonical-scoring-gate";
import {
  buildDedupeSkipResult,
  findRecentFitScoreForDedupe,
  logFitScoreConcurrentSkip,
  logFitScoreDedupeSkip,
  releaseFitScoreScoringLock,
  tryAcquireFitScoreScoringLock,
} from "@/lib/fitscore/scoring-guard";

const FITSCORE_JOB_COLUMNS =
  "id, title, description, location, status, compensation_min, compensation_max, organisation_id, skills_required";
const FITSCORE_CANDIDATE_COLUMNS =
  "id, name, full_name, skills, experience_years, location, intent_score, resume_url, cv_url, cv_raw_text, current_role, current_company, seniority_level, updated_at";

export type FitScoreComputeOptions = {
  /** Bypass 4h dedupe (manual rescore, scripts). Alias: forceRescore. */
  force?: boolean;
  forceRescore?: boolean;
  /** Entry point for cost attribution and dedupe tracing. */
  source?: FitScoreScoringSource;
  saveToDb?: boolean;
  isTestRun?: boolean;
  onUnapprovedJdBase?: "throw" | "queue_pending";
  /** Batch path: precomputed hireability bonus per candidate. */
  applicationCompletenessBonus?: number;
  /** Skip LLM explanation step (tryout progressive UI). */
  skipExplanation?: boolean;
  /**
   * Skip BOTH the canonical screening gate and the legacy prescreen gate, scoring
   * regardless of screening answers. Set ONLY by the agency bulk-upload path, where
   * the recruiter uploads for one job and no candidate is present to answer questions.
   */
  bypassScreeningGate?: boolean;
};

export const FitScoreService = {
  async listForJob(supabase: SupabaseClient, jobId: string) {
    return FitScoreRepository.listForJob(supabase, jobId);
  },

  async listForJobReview(supabase: SupabaseClient, jobId: string) {
    return FitScoreRepository.listForJobReview(supabase, jobId);
  },

  async listForCandidate(supabase: SupabaseClient, candidateId: string) {
    return FitScoreRepository.listForCandidate(supabase, candidateId);
  },

  async listForOrg(supabase: SupabaseClient, orgId: string) {
    const jobIds = await JobRepository.getJobIds(supabase, {
      organisationId: orgId,
    });
    return FitScoreRepository.listForOrg(supabase, jobIds);
  },

  async listForHiringManager(supabase: SupabaseClient, userId: string) {
    const jobIds = await JobRepository.getJobIds(supabase, {
      hiringManagerId: userId,
    });
    return FitScoreRepository.listForOrg(supabase, jobIds);
  },

  async getShortlist(
    supabase: SupabaseClient,
    jobId: string,
    params: {
      minScore: number;
      page: number;
      limit: number;
      organisationId: string;
    },
  ) {
    return FitScoreRepository.getShortlistForJob(supabase, jobId, params);
  },

  async computeSingle(
    supabase: SupabaseClient,
    jobId: string,
    candidateId: string,
    options?: FitScoreComputeOptions,
  ) {
    const force = options?.force === true || options?.forceRescore === true;
    const source = options?.source;

    if (!force) {
      const recent = await findRecentFitScoreForDedupe(supabase, jobId, candidateId);
      if (recent) {
        logFitScoreDedupeSkip({
          candidateId,
          jobId,
          source,
          existingScore: recent.overall_score,
          createdAt: recent.created_at,
        });
        return buildDedupeSkipResult(recent);
      }
    }

    const lockAcquired = await tryAcquireFitScoreScoringLock(supabase, jobId, candidateId, source);
    if (!lockAcquired) {
      logFitScoreConcurrentSkip({ candidateId, jobId, source });
      const recent = await findRecentFitScoreForDedupe(
        supabase,
        jobId,
        candidateId,
        24 * 60 * 60 * 1000,
      );
      if (recent) return buildDedupeSkipResult(recent);
      return {
        scoring_status: "concurrent_skip" as const,
        job_id: jobId,
        candidate_id: candidateId,
      };
    }

    try {
      const [{ data: job }, { data: candidate }] = await Promise.all([
        supabase.from("jobs").select(FITSCORE_JOB_COLUMNS).eq("id", jobId).single(),
        supabase
          .from("candidates")
          .select(FITSCORE_CANDIDATE_COLUMNS)
          .eq("id", candidateId)
          .single(),
      ]);
      if (!job) throw new Error("Job not found");
      if (!candidate) throw new Error("Candidate not found");

      // Canonical scoring gate (ALWAYS-ON, all channels): score only when the job's
      // active job_screening_questions are answered AND match the expected answers.
      // This is the single choke point that fixes every entry point at once.
      //
      // EXCEPTION: agency bulk upload. The recruiter uploads CVs for one job with no
      // candidate present to answer screening questions, so the bulk-upload chain sets
      // bypassScreeningGate to score regardless (both this gate and the legacy one).
      if (options?.bypassScreeningGate === true) {
        logger.info("FitScore screening gate bypassed", {
          job_id: jobId,
          candidate_id: candidateId,
          source,
        });
      }
      const canonicalGate = options?.bypassScreeningGate
        ? ({ applies: false } as const)
        : await evaluateCanonicalScreeningGate({
            admin: supabase,
            jobId,
            candidateId,
          });
      if (canonicalGate.applies) {
        // Mirror the decision onto applications.gate_status for observability.
        await recordCanonicalGateStatus({
          admin: supabase,
          jobId,
          candidateId,
          gateStatus: canonicalGate.block ? canonicalGate.gateStatus : "passed",
        });
        if (canonicalGate.block) {
          logger.info("FitScore skipped by canonical screening gate", {
            job_id: jobId,
            candidate_id: candidateId,
            reason: canonicalGate.reason,
            gate_status: canonicalGate.gateStatus,
          });
          return {
            scoring_status: "prescreen_gate_blocked" as const,
            job_id: jobId,
            candidate_id: candidateId,
            gate_status: canonicalGate.gateStatus,
          };
        }
      } else if (!options?.bypassScreeningGate) {
        // Fallback for jobs with NO job_screening_questions: legacy per-channel
        // prescreen gate (flag-gated; reads applications.gate_status). Nothing
        // regresses for jobs still on the legacy prescreen_questions path.
        // Skipped entirely for the bulk-upload bypass.
        const prescreenGate = await checkPrescreenGate({
          admin: supabase,
          jobId,
          candidateId,
          organisationId: (job as { organisation_id?: string | null }).organisation_id ?? null,
        });
        if (prescreenGate.block) {
          logger.info("FitScore skipped by prescreen gate", {
            job_id: jobId,
            candidate_id: candidateId,
            reason: prescreenGate.reason,
            gate_status: prescreenGate.gateStatus,
          });
          return {
            scoring_status: "prescreen_gate_blocked" as const,
            job_id: jobId,
            candidate_id: candidateId,
            gate_status: prescreenGate.gateStatus,
          };
        }
      }

      const jdBase = await getJdBaseByJobId(supabase, jobId);
      if (!jdBase?.approvedBy) {
        if ((options?.onUnapprovedJdBase ?? "queue_pending") === "queue_pending") {
          await enqueuePendingJdApprovalPair(supabase, jobId, candidateId);
          return {
            scoring_status: "pending_jd_approval" as const,
            job_id: jobId,
            candidate_id: candidateId,
          };
        }
        throw new Error("jd_base_not_approved");
      }
      recordScoringPathMetric("hybrid");
      const score = await runHybridFitScorePipeline(supabase, {
        job,
        candidate,
        jdBase,
        saveToDb: options?.saveToDb,
        isTestRun: options?.isTestRun,
        scoringSource: source,
        applicationCompletenessBonus: options?.applicationCompletenessBonus,
        skipExplanation: options?.skipExplanation,
      });
      logger.info("FitScore computed", {
        job_id: jobId,
        candidate_id: candidateId,
        force,
        source,
        isTestRun: options?.isTestRun,
        scoring_pipeline: "hybrid_v2",
      });

      return score;
    } finally {
      await releaseFitScoreScoringLock(supabase, jobId, candidateId);
    }
  },

  async computeBatch(
    supabase: SupabaseClient,
    jobId: string,
    candidateIds: string[],
    options?: Pick<
      FitScoreComputeOptions,
      "onUnapprovedJdBase" | "source" | "force" | "forceRescore" | "bypassScreeningGate"
    >,
  ) {
    const { data: job } = await supabase
      .from("jobs")
      .select(FITSCORE_JOB_COLUMNS)
      .eq("id", jobId)
      .single();
    if (!job) throw new Error("Job not found");

    const { data: candidates } = await supabase
      .from("candidates")
      .select(FITSCORE_CANDIDATE_COLUMNS)
      .in("id", candidateIds);

    if (!candidates?.length) throw new Error("No candidates found");

    const jdBase = await getJdBaseByJobId(supabase, jobId);
    if (!jdBase?.approvedBy) {
      if ((options?.onUnapprovedJdBase ?? "queue_pending") === "queue_pending") {
        await enqueuePendingJdApprovalPairs(
          supabase,
          candidateIds.map((candidateId) => ({ jobId, candidateId })),
        );
        return {
          scores: [],
          scored: 0,
          failed: 0,
          scoredCandidateIds: [] as string[],
          failedCandidateIds: [] as Array<{ candidateId: string; error: string }>,
          status: "pending_jd_approval" as const,
          message: JD_BASE_NOT_APPROVED_MESSAGE,
        };
      }
      throw new Error("jd_base_not_approved");
    }
    recordScoringPathMetric("hybrid");
    const hireabilityBonusByCandidate = await prefetchApplicationCompletenessBonusesForJob(
      supabase,
      jobId,
      candidates.map((c) => String(c.id)),
    );
    const concurrency = env.fitscoreBatchConcurrency;
    const limiter = pLimit(concurrency);
    let inFlight = 0;
    let highWaterMark = 0;
    const results = await Promise.allSettled(
      candidates.map((c) =>
        limiter(async () => {
          inFlight += 1;
          highWaterMark = Math.max(highWaterMark, inFlight);
          try {
            return await FitScoreService.computeSingle(supabase, jobId, String(c.id), {
              source: options?.source,
              force: options?.force,
              forceRescore: options?.forceRescore,
              saveToDb: true,
              onUnapprovedJdBase: "throw",
              applicationCompletenessBonus: hireabilityBonusByCandidate.get(String(c.id)) ?? 0,
              bypassScreeningGate: options?.bypassScreeningGate,
            });
          } finally {
            inFlight -= 1;
          }
        }),
      ),
    );

    const fulfilledWithCandidate = results.flatMap((result, index) => {
      if (result.status !== "fulfilled") return [];
      const value = result.value as Record<string, unknown>;
      if (value.scoring_status === "deduped" || value.scoring_status === "concurrent_skip") {
        return [];
      }
      return [{ score: result.value, candidateId: String(candidates[index]?.id ?? "") }];
    });
    const scores = fulfilledWithCandidate.map((entry) => entry.score);
    const scoredCandidateIds = fulfilledWithCandidate
      .map((entry) => entry.candidateId)
      .filter((candidateId) => candidateId.length > 0);
    const failedCandidateIds = results.flatMap((result, index) =>
      result.status === "rejected"
        ? [
            {
              candidateId: String(candidates[index]?.id ?? ""),
              error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            },
          ]
        : [],
    );
    const failures = results.filter((r) => r.status === "rejected").length;

    logger.info("Batch FitScore computed", {
      job_id: jobId,
      scored: scores.length,
      failed: failures,
      scoring_pipeline: "hybrid_v2",
      batch_concurrency_limit: concurrency,
      batch_concurrency_high_water_mark: highWaterMark,
    });
    try {
      await recordPlatformCostEvent({
        provider: "anthropic",
        service: "fitscore_batch",
        category: "observability",
        amountUsd: 0,
        quantity: candidates.length,
        unit: "candidates",
        organisationId: (job.organisation_id as string | undefined) ?? undefined,
        metadata: {
          job_id: jobId,
          scored: scores.length,
          failed: failures,
          batch_concurrency_limit: concurrency,
          batch_concurrency_high_water_mark: highWaterMark,
          scoring_pipeline: "hybrid_v2",
        },
      });
    } catch (error) {
      logger.warn("Failed to record batch observability event", {
        job_id: jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      scores,
      scored: scores.length,
      failed: failures,
      scoredCandidateIds,
      failedCandidateIds,
    };
  },

  async getLatestProductionScore(
    supabase: SupabaseClient,
    jobId: string,
    candidateId: string,
  ): Promise<Record<string, unknown> | null> {
    const { data } = await supabase
      .from("fit_scores")
      .select(
        // fit_scores has no `updated_at`; the row-level timestamps are
        // created_at and scoring_status_updated_at.
        "id, job_id, candidate_id, overall_score, band, confidence, one_line_summary, scoring_status, created_at, scoring_status_updated_at",
      )
      .eq("job_id", jobId)
      .eq("candidate_id", candidateId)
      .eq("is_test_run", false)
      .is("superseded_at", null)
      .order("run_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as Record<string, unknown> | null) ?? null;
  },

  async markDeferredScore(
    supabase: SupabaseClient,
    jobId: string,
    candidateId: string,
    reason: string,
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    try {
      const { data: existing } = await supabase
        .from("fit_scores")
        .select("id")
        .eq("job_id", jobId)
        .eq("candidate_id", candidateId)
        .eq("is_test_run", false)
        .is("superseded_at", null)
        .order("run_index", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        await supabase
          .from("fit_scores")
          .update({
            scoring_status: "deferred",
            scoring_status_reason: reason,
            scoring_status_updated_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", existing.id);
        return;
      }

      // Best effort: if schema constraints require score fields, insert can fail. In that case,
      // we still return deferred status from API and rely on next batch pass to create scored row.
      await supabase.from("fit_scores").insert({
        job_id: jobId,
        candidate_id: candidateId,
        run_index: 1,
        is_test_run: false,
        scoring_status: "deferred",
        scoring_status_reason: reason,
        scoring_status_updated_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      });
    } catch (error) {
      logger.warn("Failed to persist deferred FitScore status", {
        job_id: jobId,
        candidate_id: candidateId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

/** Numeric overall from hybrid / legacy scorer results; null for pending or non-numeric payloads. */
export function numericOverallFromFitScoreServiceResult(result: unknown): number | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (r.scoring_status === "pending_jd_approval") return null;
  if (r.scoring_status === "deduped" || r.scoring_status === "concurrent_skip") {
    const fitScore = r.fitScore;
    if (typeof fitScore === "number" && Number.isFinite(fitScore)) return fitScore;
    const score = r.score;
    if (typeof score === "number" && Number.isFinite(score)) return score;
    return null;
  }
  const fitScore = r.fitScore;
  if (typeof fitScore === "number" && Number.isFinite(fitScore)) return fitScore;
  const score = r.score;
  if (typeof score === "number" && Number.isFinite(score)) return score;
  const overall_score = r.overall_score;
  if (typeof overall_score === "number" && Number.isFinite(overall_score)) return overall_score;
  return null;
}
