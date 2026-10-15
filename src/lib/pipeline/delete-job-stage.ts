import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export class LockedPipelineStageError extends Error {
  constructor() {
    super("System stages cannot be removed");
    this.name = "LockedPipelineStageError";
  }
}

/**
 * Deletes a job pipeline stage (admin client). Moves pipeline_candidates to FitScore Review,
 * then renumbers stage_order without gaps.
 */
export async function deleteJobPipelineStage(
  admin: SupabaseClient,
  jobId: string,
  stageId: string,
): Promise<void> {
  const { data: stage, error: stErr } = await admin
    .from("pipeline_stages")
    .select("id, job_id, is_locked, stage_name, stage_order")
    .eq("id", stageId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (stErr || !stage) {
    throw new Error("Stage not found");
  }
  if (stage.is_locked === true) {
    throw new LockedPipelineStageError();
  }

  const { data: fitRow } = await admin
    .from("pipeline_stages")
    .select("id")
    .eq("job_id", jobId)
    .eq("stage_name", "FitScore Review")
    .maybeSingle();
  const fitScoreStageId = fitRow?.id as string | undefined;
  if (!fitScoreStageId) {
    logger.error("deleteJobPipelineStage: FitScore Review stage missing for job", { jobId });
    throw new Error("FitScore Review stage is not configured for this job");
  }

  const { error: moveErr } = await admin
    .from("pipeline_candidates")
    .update({ stage_id: fitScoreStageId })
    .eq("job_id", jobId)
    .eq("stage_id", stageId);

  if (moveErr) {
    logger.error("deleteJobPipelineStage: failed to move candidates", { error: moveErr.message });
    throw moveErr;
  }

  const { error: delErr } = await admin
    .from("pipeline_stages")
    .delete()
    .eq("id", stageId)
    .eq("job_id", jobId);

  if (delErr) {
    logger.error("deleteJobPipelineStage: delete failed", { error: delErr.message });
    throw delErr;
  }

  const { data: remaining, error: listErr } = await admin
    .from("pipeline_stages")
    .select("id, stage_order")
    .eq("job_id", jobId)
    .order("stage_order", { ascending: true });

  if (listErr || !remaining) {
    return;
  }

  let idx = 0;
  for (const row of remaining) {
    const want = idx++;
    if ((row.stage_order as number) !== want) {
      await admin
        .from("pipeline_stages")
        .update({ stage_order: want })
        .eq("id", row.id as string);
    }
  }
}
