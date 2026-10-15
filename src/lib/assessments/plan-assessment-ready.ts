import { getStageSetupStatus } from "@/lib/recruitment-plan/plan-stage-config-profile";
import type { PlanStageRow } from "@/lib/recruitment-plan/types";

/** Client-safe: whether an assessment plan stage is configured for auto-send on entry. */
export function isAssessmentStageReadyForAutoSend(planStage: PlanStageRow): boolean {
  if (planStage.stage_type !== "assessment") return false;
  if (!planStage.pipeline_stage_id) return false;
  return getStageSetupStatus(planStage) === "ready";
}
