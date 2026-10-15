import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanStageActions } from "@/components/recruit/plan/PlanStageActions";
import type { PlanStageRow } from "@/lib/recruitment-plan/types";

function makeStage(overrides: Partial<PlanStageRow> = {}): PlanStageRow {
  return {
    id: "stage-1",
    plan_id: "plan-1",
    pipeline_stage_id: null,
    stage_order: 2,
    stage_type: "assessment",
    display_name: "Take-home",
    primary_interviewer_id: null,
    backup_interviewer_id: null,
    duration_minutes: 60,
    format: "async",
    scorecard_template_id: null,
    comms_template_id: null,
    comms_template: null,
    approval_gate: "none",
    target_dwell_days: 5,
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("PlanStageActions", () => {
  it("links assessment stages to the assessments workspace", () => {
    render(
      <PlanStageActions
        jobId="job-1"
        stage={makeStage()}
        candidateCount={3}
        sampleApplicationId="app-1"
      />,
    );
    const link = screen.getByRole("link", { name: /open assessments/i });
    expect(link.getAttribute("href")).toBe("/recruit/jobs/job-1/assessments?applicationId=app-1");
  });

  it("includes stageId when plan stage is linked to pipeline", () => {
    render(
      <PlanStageActions
        jobId="job-1"
        stage={makeStage({ pipeline_stage_id: "pipe-stage-1" })}
        candidateCount={1}
      />,
    );
    const link = screen.getByRole("link", { name: /open assessments/i });
    expect(link.getAttribute("href")).toBe("/recruit/jobs/job-1/assessments?stageId=pipe-stage-1");
  });

  it("links interview stages to job interviews", () => {
    render(
      <PlanStageActions
        jobId="job-1"
        stage={makeStage({ stage_type: "interview", format: "video" })}
        candidateCount={0}
      />,
    );
    const link = screen.getByRole("link", { name: /open interviews/i });
    expect(link.getAttribute("href")).toBe("/recruit/jobs/job-1/interviews");
  });
});
