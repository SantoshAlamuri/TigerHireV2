/**
 * FitScore dedupe (4h window) and concurrent scoring lock (Postgres RPC).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { FITSCORE_DEDUPE_WINDOW_MS, type FitScoreScoringSource } from "./scoring-source";
import { recordFitScoreObservabilityEvent } from "./scoring-observability";

export type { FitScoreScoringSource } from "./scoring-source";

export type RecentFitScoreRow = {
  id: string;
  job_id: string;
  candidate_id: string;
  overall_score: number | null;
  band: string | null;
  one_line_summary: string | null;
  scoring_status: string | null;
  created_at: string;
};

/** Latest production score for dedupe (scored within window, not superseded). */
export async function findRecentFitScoreForDedupe(
  supabase: SupabaseClient,
  jobId: string,
  candidateId: string,
  windowMs: number = FITSCORE_DEDUPE_WINDOW_MS,
): Promise<RecentFitScoreRow | null> {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { data, error } = await supabase
    .from("fit_scores")
    .select(
      "id, job_id, candidate_id, overall_score, band, one_line_summary, scoring_status, created_at",
    )
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .eq("is_test_run", false)
    .is("superseded_at", null)
    .eq("scoring_status", "scored")
    .gte("created_at", since)
    .order("run_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn("findRecentFitScoreForDedupe: query failed", {
      job_id: jobId,
      candidate_id: candidateId,
      message: error.message,
    });
    return null;
  }
  return (data as RecentFitScoreRow | null) ?? null;
}

export function buildDedupeSkipResult(row: RecentFitScoreRow): Record<string, unknown> {
  return {
    scoring_status: "deduped" as const,
    job_id: row.job_id,
    candidate_id: row.candidate_id,
    fitScore: row.overall_score,
    score: row.overall_score,
    fit_scores_id: row.id,
    band: row.band,
    one_line_summary: row.one_line_summary,
    deduped: true,
  };
}

export function logFitScoreDedupeSkip(params: {
  candidateId: string;
  jobId: string;
  source?: FitScoreScoringSource;
  existingScore: number | null;
  createdAt: string;
}): void {
  const ageHours = (Date.now() - new Date(params.createdAt).getTime()) / (60 * 60 * 1000);
  logger.info(
    JSON.stringify({
      type: "fitscore_dedupe_skip",
      candidate_id: params.candidateId,
      job_id: params.jobId,
      source: params.source ?? null,
      age_hours: Number(ageHours.toFixed(2)),
      existing_score: params.existingScore,
    }),
  );
  recordFitScoreObservabilityEvent({
    eventType: "fitscore_dedupe_skip",
    jobId: params.jobId,
    candidateId: params.candidateId,
    metadata: { source: params.source ?? null, existing_score: params.existingScore },
  });
}

export function logFitScoreConcurrentSkip(params: {
  candidateId: string;
  jobId: string;
  source?: FitScoreScoringSource;
}): void {
  logger.info(
    JSON.stringify({
      type: "fitscore_concurrent_skip",
      candidate_id: params.candidateId,
      job_id: params.jobId,
      source: params.source ?? null,
    }),
  );
  recordFitScoreObservabilityEvent({
    eventType: "fitscore_concurrent_skip",
    jobId: params.jobId,
    candidateId: params.candidateId,
    metadata: { source: params.source ?? null },
  });
}

/** Returns true when this worker should proceed with scoring. */
export async function tryAcquireFitScoreScoringLock(
  supabase: SupabaseClient,
  jobId: string,
  candidateId: string,
  source?: FitScoreScoringSource,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("try_acquire_fit_score_scoring_lock", {
    p_job_id: jobId,
    p_candidate_id: candidateId,
    p_source: source ?? null,
  });

  if (error) {
    logger.warn("tryAcquireFitScoreScoringLock: RPC failed — skipping scoring", {
      job_id: jobId,
      candidate_id: candidateId,
      message: error.message,
    });
    return false;
  }
  return data === true;
}

export async function releaseFitScoreScoringLock(
  supabase: SupabaseClient,
  jobId: string,
  candidateId: string,
): Promise<void> {
  const { error } = await supabase.rpc("release_fit_score_scoring_lock", {
    p_job_id: jobId,
    p_candidate_id: candidateId,
  });
  if (error) {
    logger.warn("releaseFitScoreScoringLock: RPC failed", {
      job_id: jobId,
      candidate_id: candidateId,
      message: error.message,
    });
  }
}
