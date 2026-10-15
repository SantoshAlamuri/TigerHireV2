/**
 * Persist terminal hire/reject outcomes with FitScore snapshot for the v2.0 learning loop.
 * Called from ApplicationService and POST /api/feedback/hire (non-blocking on failure).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export type HiringOutcomeType = "hired" | "rejected";
export type HiringOutcomeSource = "application_service" | "feedback_hire_api" | "manual";

export async function upsertHiringOutcome(
  admin: SupabaseClient,
  params: {
    jobId: string;
    candidateId: string;
    outcome: HiringOutcomeType;
    recordedByUserId: string;
    source?: HiringOutcomeSource;
    sourceEventId?: string;
  },
): Promise<void> {
  const {
    jobId,
    candidateId,
    outcome,
    recordedByUserId,
    source = "manual",
    sourceEventId,
  } = params;

  const { data: job, error: jobErr } = await admin
    .from("jobs")
    .select("organisation_id")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr || !job?.organisation_id) {
    logger.warn("[hiring_outcomes] skip: job or organisation_id missing", {
      jobId,
      candidateId,
      error: jobErr?.message,
    });
    return;
  }

  const { data: score } = await admin
    .from("fit_scores")
    .select(
      "id, overall_score, primary_score, band, parse_quality_score, extraction_model, scoring_version",
    )
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .eq("is_test_run", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const primary = score?.primary_score;
  const overall = score?.overall_score;
  const raw =
    primary != null && primary !== ("" as unknown)
      ? Number(primary)
      : overall != null
        ? Number(overall)
        : null;
  const fitscore =
    raw != null && Number.isFinite(raw) ? Math.min(100, Math.max(0, Math.round(raw))) : null;

  const lowFitscoreOverride = fitscore != null && fitscore < 50;
  const recordedAt = new Date().toISOString();

  const { error: rpcErr } = await admin.rpc("upsert_hiring_outcome_signal", {
    p_job_id: jobId,
    p_candidate_id: candidateId,
    p_organisation_id: job.organisation_id,
    p_outcome: outcome,
    p_fit_score_id: (score?.id as string | undefined) ?? null,
    p_fit_score_value: fitscore,
    p_scoring_version:
      score?.scoring_version != null && score.scoring_version !== ("" as unknown)
        ? Number(score.scoring_version)
        : 1,
    p_fitscore: fitscore,
    p_band: score?.band ?? null,
    p_extraction_model: score?.extraction_model ?? null,
    p_parse_quality_score: score?.parse_quality_score ?? null,
    p_low_fitscore_override: lowFitscoreOverride,
    p_recorded_by: recordedByUserId,
    p_recorded_at: recordedAt,
    p_source: source,
    p_source_event_id: sourceEventId ?? null,
  });

  if (!rpcErr) return;

  logger.warn("[hiring_outcomes] rpc upsert failed; applying fallback", {
    jobId,
    candidateId,
    outcome,
    message: rpcErr.message,
    code: rpcErr.code,
  });

  // Fallback behavior for environments where the RPC migration is not yet applied.
  const { data: existing } = await admin
    .from("hiring_outcomes")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .maybeSingle();

  const row = {
    job_id: jobId,
    candidate_id: candidateId,
    organisation_id: job.organisation_id,
    outcome,
    fit_score_id: (score?.id as string | undefined) ?? null,
    fit_score_value: fitscore,
    scoring_version:
      score?.scoring_version != null && score.scoring_version !== ("" as unknown)
        ? Number(score.scoring_version)
        : 1,
    fitscore,
    band: score?.band ?? null,
    extraction_model: score?.extraction_model ?? null,
    parse_quality_score: score?.parse_quality_score ?? null,
    low_fitscore_override: lowFitscoreOverride,
    recorded_by: recordedByUserId,
    recorded_at: recordedAt,
    source,
    source_event_id: sourceEventId ?? null,
  };

  if (existing?.id) {
    const { error: updateErr } = await admin
      .from("hiring_outcomes")
      .update(row)
      .eq("id", existing.id);
    if (updateErr) {
      logger.warn("[hiring_outcomes] fallback update failed", {
        jobId,
        candidateId,
        outcome,
        message: updateErr.message,
        code: updateErr.code,
      });
    }
    return;
  }

  const { error: insertErr } = await admin.from("hiring_outcomes").insert(row);
  if (insertErr) {
    logger.warn("[hiring_outcomes] fallback insert failed", {
      jobId,
      candidateId,
      outcome,
      message: insertErr.message,
      code: insertErr.code,
    });
  }
}
