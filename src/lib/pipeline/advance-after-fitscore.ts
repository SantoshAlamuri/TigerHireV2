import type { SupabaseClient } from "@supabase/supabase-js";
import { logPipelineStageTransition } from "@/lib/analytics/log-pipeline-stage-transition";
import { logger } from "@/lib/observability/logger";
import { dispatchPlanStageOnCandidateMove } from "@/lib/recruitment-plan/plan-stage-dispatch";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { LOCKED_SYSTEM_STAGE_NAMES } from "@/lib/pipeline/stage-types";

const APPLIED_STAGE_NAME = LOCKED_SYSTEM_STAGE_NAMES[0];
const FITSCORE_REVIEW_STAGE_NAME = LOCKED_SYSTEM_STAGE_NAMES[1];

export type AdvanceAfterFitScoreResult =
  | { advanced: true; fromStage: string; toStage: string }
  | { advanced: false; reason: string };

type PipelineStageRow = {
  id: string;
  stage_name: string;
  stage_order: number;
};

function normalizeStageName(name: string): string {
  return name.trim().toLowerCase();
}

function isAppliedStageName(name: string): boolean {
  const n = normalizeStageName(name);
  return n === "applied" || n === "new" || n === "inbound";
}

function findAppliedStage(stages: PipelineStageRow[]): PipelineStageRow | null {
  const exact = stages.find((s) => s.stage_name === APPLIED_STAGE_NAME);
  if (exact) return exact;
  const fuzzy = stages.find((s) => isAppliedStageName(s.stage_name));
  if (fuzzy) return fuzzy;
  if (stages.length === 0) return null;
  return [...stages].sort((a, b) => a.stage_order - b.stage_order)[0] ?? null;
}

/**
 * Prefer locked "FitScore Review"; otherwise the first stage after Applied by order
 * (covers legacy/custom job pipelines e.g. QA demo jobs without that exact name).
 */
function resolvePostScoreStage(
  stages: PipelineStageRow[],
  appliedStage: PipelineStageRow,
): PipelineStageRow | null {
  const exact = stages.find((s) => s.stage_name === FITSCORE_REVIEW_STAGE_NAME);
  if (exact) return exact;

  const fuzzy = stages.find((s) => {
    const n = normalizeStageName(s.stage_name);
    return n.includes("fitscore") || n.includes("fit score");
  });
  if (fuzzy) return fuzzy;

  const sorted = [...stages].sort((a, b) => a.stage_order - b.stage_order);
  return (
    sorted.find((s) => s.stage_order > appliedStage.stage_order) ??
    sorted.find((s) => s.id !== appliedStage.id) ??
    null
  );
}

function isOnAppliedStage(
  stages: PipelineStageRow[],
  appliedStage: PipelineStageRow,
  currentStageId: string | null,
): boolean {
  if (!currentStageId) return true;
  if (currentStageId === appliedStage.id) return true;
  const current = stages.find((s) => s.id === currentStageId);
  if (!current) return false;
  if (isAppliedStageName(current.stage_name)) return true;
  return current.stage_order <= appliedStage.stage_order;
}

/**
 * After a production FitScore is saved, move pipeline_candidates from Applied → post-score stage
 * (FitScore Review when present, else next stage by order) so hireability matches "scored".
 */
export async function advancePipelineToFitScoreReviewAfterScoring(
  _supabase: SupabaseClient,
  params: {
    jobId: string;
    candidateId: string;
    organisationId?: string;
    isTestRun?: boolean;
  },
): Promise<AdvanceAfterFitScoreResult> {
  if (params.isTestRun) {
    return { advanced: false, reason: "test_run" };
  }

  const admin = createSupabaseAdmin();

  const { data: pcRows, error: pcErr } = await admin
    .from("pipeline_candidates")
    .select("id, stage_id")
    .eq("job_id", params.jobId)
    .eq("candidate_id", params.candidateId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (pcErr) {
    logger.warn("advanceAfterFitScore: pipeline_candidates read failed", {
      jobId: params.jobId,
      candidateId: params.candidateId,
      error: pcErr.message,
    });
    return { advanced: false, reason: "read_failed" };
  }

  const pc = pcRows?.[0];
  if (!pc?.id) {
    return { advanced: false, reason: "no_pipeline_row" };
  }

  const { data: stages, error: stagesErr } = await admin
    .from("pipeline_stages")
    .select("id, stage_name, stage_order")
    .eq("job_id", params.jobId)
    .order("stage_order", { ascending: true });

  if (stagesErr || !stages?.length) {
    logger.warn("advanceAfterFitScore: no pipeline stages for job", {
      jobId: params.jobId,
      error: stagesErr?.message,
    });
    return { advanced: false, reason: "no_stages" };
  }

  const stageRows = stages as PipelineStageRow[];
  const appliedStage = findAppliedStage(stageRows);
  if (!appliedStage) {
    return { advanced: false, reason: "no_applied_stage" };
  }

  const targetStage = resolvePostScoreStage(stageRows, appliedStage);
  if (!targetStage) {
    return { advanced: false, reason: "no_post_score_stage" };
  }

  const currentStageId = (pc.stage_id as string | null) ?? null;
  if (currentStageId === targetStage.id) {
    return { advanced: false, reason: "already_at_post_score_stage" };
  }

  if (!isOnAppliedStage(stageRows, appliedStage, currentStageId)) {
    const current = currentStageId ? stageRows.find((s) => s.id === currentStageId) : null;
    const currentOrder = current?.stage_order ?? -1;
    if (currentOrder > targetStage.stage_order) {
      return { advanced: false, reason: "already_past_post_score_stage" };
    }
    return { advanced: false, reason: "not_on_applied" };
  }

  const fromStageLabel = currentStageId
    ? (stageRows.find((s) => s.id === currentStageId)?.stage_name ?? APPLIED_STAGE_NAME)
    : APPLIED_STAGE_NAME;

  // System move after scoring: Applied → post-score stage. Do not require recruiter
  // shortlist / HM plan gates (those apply to human moves into interview+ stages).
  const { error: updateErr } = await admin
    .from("pipeline_candidates")
    .update({ stage_id: targetStage.id })
    .eq("id", pc.id);

  if (updateErr) {
    logger.warn("advanceAfterFitScore: stage update failed", {
      jobId: params.jobId,
      candidateId: params.candidateId,
      error: updateErr.message,
    });
    return { advanced: false, reason: "update_failed" };
  }

  logPipelineStageTransition(admin, {
    jobId: params.jobId,
    candidateId: params.candidateId,
    pipelineCandidateId: String(pc.id),
    fromStage: fromStageLabel,
    toStage: targetStage.stage_name,
    movedBy: null,
  });

  let organisationId = params.organisationId;
  if (!organisationId) {
    const { data: job } = await admin
      .from("jobs")
      .select("organisation_id")
      .eq("id", params.jobId)
      .maybeSingle();
    organisationId = job?.organisation_id as string | undefined;
  }

  if (organisationId) {
    void dispatchPlanStageOnCandidateMove({
      jobId: params.jobId,
      organisationId,
      pipelineCandidateId: String(pc.id),
      candidateId: params.candidateId,
      pipelineStageId: targetStage.id,
      initiatedBy: null,
    });
  }

  logger.info("advanceAfterFitScore: moved candidate after scoring", {
    jobId: params.jobId,
    candidateId: params.candidateId,
    fromStage: fromStageLabel,
    toStage: targetStage.stage_name,
  });

  return {
    advanced: true,
    fromStage: fromStageLabel,
    toStage: targetStage.stage_name,
  };
}

/**
 * Backfill: candidates with an active production FitScore still on Applied (or equivalent).
 */
export async function advanceScoredPipelineCandidatesForJob(jobId: string): Promise<{
  examined: number;
  advanced: number;
  skipped: Array<{ candidateId: string; reason: string }>;
}> {
  const admin = createSupabaseAdmin();
  const skipped: Array<{ candidateId: string; reason: string }> = [];
  let advanced = 0;

  const { data: scores, error: scoreErr } = await admin
    .from("fit_scores")
    .select("candidate_id")
    .eq("job_id", jobId)
    .eq("is_test_run", false)
    .is("superseded_at", null);

  if (scoreErr) {
    throw new Error(`fit_scores read failed: ${scoreErr.message}`);
  }

  const candidateIds = [
    ...new Set((scores ?? []).map((r) => String((r as { candidate_id: string }).candidate_id))),
  ];

  for (const candidateId of candidateIds) {
    const result = await advancePipelineToFitScoreReviewAfterScoring(admin, {
      jobId,
      candidateId,
    });
    if (result.advanced) {
      advanced += 1;
    } else if (result.reason !== "already_at_post_score_stage") {
      skipped.push({ candidateId, reason: result.reason });
    }
  }

  return { examined: candidateIds.length, advanced, skipped };
}
