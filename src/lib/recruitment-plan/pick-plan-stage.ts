import { inferPlanStageType } from "./infer-stage-type";
import type { PlanStageRow } from "./types";

export type PipelineStageMatchInput = {
  id: string;
  stage_order: number;
  stage_name: string;
  stage_type: string | null;
};

/**
 * Resolve the plan stage for a pipeline stage. Prefer stable FK; fall back to legacy heuristics.
 */
export function pickPlanStageForPipeline(
  stages: PlanStageRow[],
  pipelineStage: PipelineStageMatchInput,
): PlanStageRow | undefined {
  const byFk = stages.find((s) => s.pipeline_stage_id === pipelineStage.id);
  if (byFk) return byFk;

  const order = pipelineStage.stage_order;
  const name = String(pipelineStage.stage_name ?? "").toLowerCase();

  return (
    stages.find((s) => s.stage_order === order) ??
    stages.find((s) => s.display_name.toLowerCase() === name) ??
    stages.find(
      (s) =>
        s.stage_type ===
        inferPlanStageType({
          stageName: pipelineStage.stage_name,
          pipelineStageType: pipelineStage.stage_type,
        }),
    )
  );
}
