import { describe, expect, it } from "vitest";
import { pickPlanStageForPipeline } from "@/lib/recruitment-plan/pick-plan-stage";
import type { PlanStageRow } from "@/lib/recruitment-plan/types";

function stage(
  partial: Partial<PlanStageRow> &
    Pick<PlanStageRow, "id" | "stage_order" | "display_name" | "stage_type">,
): PlanStageRow {
  return {
    plan_id: "plan-1",
    pipeline_stage_id: null,
    primary_interviewer_id: null,
    backup_interviewer_id: null,
    duration_minutes: null,
    format: null,
    scorecard_template_id: null,
    comms_template_id: null,
    comms_template: null,
    approval_gate: "none",
    target_dwell_days: 5,
    is_active: true,
    created_at: new Date().toISOString(),
    ...partial,
  };
}

describe("pickPlanStageForPipeline", () => {
  const stages: PlanStageRow[] = [
    stage({
      id: "ps-1",
      stage_order: 1,
      display_name: "Applied",
      stage_type: "application_review",
      pipeline_stage_id: "pipe-a",
    }),
    stage({
      id: "ps-2",
      stage_order: 2,
      display_name: "Interview",
      stage_type: "interview",
      pipeline_stage_id: null,
    }),
  ];

  it("prefers pipeline_stage_id when set", () => {
    const picked = pickPlanStageForPipeline(stages, {
      id: "pipe-a",
      stage_order: 99,
      stage_name: "Wrong name",
      stage_type: null,
    });
    expect(picked?.id).toBe("ps-1");
  });

  it("falls back to stage_order when FK missing", () => {
    const picked = pickPlanStageForPipeline(stages, {
      id: "pipe-b",
      stage_order: 2,
      stage_name: "Interview",
      stage_type: "interview",
    });
    expect(picked?.id).toBe("ps-2");
  });

  it("falls back to display_name match", () => {
    const picked = pickPlanStageForPipeline(
      [
        stage({
          id: "ps-3",
          stage_order: 5,
          display_name: "Final Chat",
          stage_type: "interview",
        }),
      ],
      {
        id: "pipe-c",
        stage_order: 9,
        stage_name: "Final Chat",
        stage_type: null,
      },
    );
    expect(picked?.id).toBe("ps-3");
  });
});
