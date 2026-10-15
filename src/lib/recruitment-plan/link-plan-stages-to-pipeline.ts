import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { pickPlanStageForPipeline } from "./pick-plan-stage";
import type { PlanStageRow } from "./types";

type PipelineStageRow = {
  id: string;
  stage_order: number;
  stage_name: string;
  stage_type: string | null;
};

/**
 * Idempotently set plan_stages.pipeline_stage_id where missing, using pipeline_stages for the job.
 */
export async function linkPlanStagesToPipeline(
  admin: SupabaseClient,
  jobId: string,
  planId: string,
  stages: PlanStageRow[],
): Promise<{ stages: PlanStageRow[]; linked: number }> {
  const unlinked = stages.filter((s) => !s.pipeline_stage_id);
  if (unlinked.length === 0) return { stages, linked: 0 };

  const { data: pipelineStages, error } = await admin
    .from("pipeline_stages")
    .select("id, stage_order, stage_name, stage_type")
    .eq("job_id", jobId)
    .order("stage_order", { ascending: true });

  if (error) {
    logger.warn("linkPlanStagesToPipeline: pipeline_stages read failed", {
      jobId,
      error: error.message,
    });
    return { stages, linked: 0 };
  }

  const pipeline = (pipelineStages ?? []) as PipelineStageRow[];
  if (pipeline.length === 0) return { stages, linked: 0 };

  let linked = 0;
  const byId = new Map(stages.map((s) => [s.id, { ...s }]));

  for (const ps of pipeline) {
    const planStage = pickPlanStageForPipeline([...byId.values()], ps);
    if (!planStage || planStage.pipeline_stage_id) continue;

    const { error: updateErr } = await admin
      .from("plan_stages")
      .update({ pipeline_stage_id: ps.id })
      .eq("id", planStage.id)
      .eq("plan_id", planId)
      .is("pipeline_stage_id", null);

    if (updateErr) {
      logger.warn("linkPlanStagesToPipeline: update failed", {
        planStageId: planStage.id,
        pipelineStageId: ps.id,
        error: updateErr.message,
      });
      continue;
    }

    byId.set(planStage.id, { ...planStage, pipeline_stage_id: ps.id });
    linked += 1;
  }

  return { stages: [...byId.values()].sort((a, b) => a.stage_order - b.stage_order), linked };
}
