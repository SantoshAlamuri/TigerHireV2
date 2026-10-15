import type { SupabaseClient } from "@supabase/supabase-js";
import { pickPlanStageForPipeline } from "./pick-plan-stage";
import { getRecruitmentPlanByJobId, listPlanStages } from "./repository";
import type { PlanStageRow, RecruitmentPlanRow } from "./types";

export type ResolvedPlanStageContext = {
  plan: RecruitmentPlanRow;
  planStage: PlanStageRow;
  pipelineStage: {
    id: string;
    stage_order: number;
    stage_name: string;
    stage_type: string | null;
  };
};

export async function resolvePlanStageForPipelineStage(
  admin: SupabaseClient,
  jobId: string,
  pipelineStageId: string,
): Promise<ResolvedPlanStageContext | null> {
  const { data: pipelineStage, error: psErr } = await admin
    .from("pipeline_stages")
    .select("id, stage_order, stage_name, stage_type")
    .eq("id", pipelineStageId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (psErr || !pipelineStage) return null;

  const { plan, error: planErr } = await getRecruitmentPlanByJobId(admin, jobId);
  if (planErr || !plan) return null;

  const { stages, error: stagesErr } = await listPlanStages(admin, plan.id);
  if (stagesErr || stages.length === 0) return null;

  const planStage = pickPlanStageForPipeline(stages, {
    id: pipelineStage.id as string,
    stage_order: pipelineStage.stage_order as number,
    stage_name: pipelineStage.stage_name as string,
    stage_type: (pipelineStage.stage_type as string | null) ?? null,
  });

  if (!planStage) return null;

  return {
    plan,
    planStage,
    pipelineStage: {
      id: pipelineStage.id as string,
      stage_order: pipelineStage.stage_order as number,
      stage_name: pipelineStage.stage_name as string,
      stage_type: (pipelineStage.stage_type as string | null) ?? null,
    },
  };
}
