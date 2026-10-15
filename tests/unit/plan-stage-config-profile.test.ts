import { describe, it, expect } from "vitest";
import {
  getPlanStageConfigProfile,
  getStageSetupStatus,
  getStageSetupSummary,
  countStagesNeedingSetup,
} from "@/lib/recruitment-plan/plan-stage-config-profile";
import type { PlanStageRow } from "@/lib/recruitment-plan/types";

function stage(
  partial: Partial<PlanStageRow> & Pick<PlanStageRow, "stage_type" | "display_name">,
): PlanStageRow {
  return {
    id: "s1",
    plan_id: "p1",
    pipeline_stage_id: null,
    stage_order: 1,
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

describe("plan-stage-config-profile", () => {
  it("uses different field sets per stage type", () => {
    const phone = getPlanStageConfigProfile("phone_screen");
    const interview = getPlanStageConfigProfile("interview");
    expect(phone.fields).toContain("comms_template");
    expect(interview.fields).toContain("primary_interviewer");
    expect(phone.fields).not.toContain("primary_interviewer");
  });

  it("marks interview as needs_setup without interviewer and duration", () => {
    expect(getStageSetupStatus(stage({ stage_type: "interview", display_name: "Tech" }))).toBe(
      "needs_setup",
    );
    expect(
      getStageSetupStatus(
        stage({
          stage_type: "interview",
          display_name: "Tech",
          primary_interviewer_id: "u1",
          duration_minutes: 60,
          format: "video",
          scorecard_template_id: "t1",
        }),
      ),
    ).toBe("ready");
  });

  it("summarizes configured interview stage", () => {
    const summary = getStageSetupSummary(
      stage({
        stage_type: "interview",
        display_name: "Tech",
        duration_minutes: 60,
        format: "video",
        primary_interviewer_id: "u1",
        scorecard_template_id: "t1",
      }),
    );
    expect(summary).toContain("60m");
    expect(summary).toContain("video");
  });

  it("counts setup progress across stages", () => {
    const counts = countStagesNeedingSetup([
      stage({ stage_type: "application_review", display_name: "App" }),
      stage({
        stage_type: "interview",
        display_name: "Tech",
        primary_interviewer_id: "u1",
        duration_minutes: 45,
        format: "video",
      }),
    ]);
    expect(counts).toEqual({ ready: 1, needsSetup: 1 });
  });
});
