import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlanStageRow } from "@/lib/recruitment-plan/types";

const mockSendShare = vi.fn().mockResolvedValue({ emailSent: true, whatsappSent: false });
const mockCreateToken = vi.fn().mockReturnValue("share-tok-abc");
const mockLogPlanSystemEvent = vi.fn().mockResolvedValue(undefined);
const mockCreateNotification = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/services/assessment-share", () => ({
  createAssessmentShareToken: () => mockCreateToken(),
  sendAssessmentShareMessages: (...args: unknown[]) => mockSendShare(...args),
}));

vi.mock("@/lib/recruitment-plan/plan-history-log", () => ({
  logPlanSystemEvent: (...args: unknown[]) => mockLogPlanSystemEvent(...args),
}));

vi.mock("@/lib/services/notifications", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

function makeAssessmentStage(overrides: Partial<PlanStageRow> = {}): PlanStageRow {
  return {
    id: "plan-stage-1",
    plan_id: "plan-1",
    pipeline_stage_id: "pipe-1",
    stage_order: 3,
    stage_type: "assessment",
    display_name: "Take-home exercise",
    primary_interviewer_id: null,
    backup_interviewer_id: null,
    duration_minutes: 120,
    format: "async",
    scorecard_template_id: "rubric-1",
    comms_template_id: null,
    comms_template: null,
    approval_gate: "none",
    target_dwell_days: 5,
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("plan assessment auto-send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isAssessmentStageReadyForAutoSend requires ready assessment with pipeline link", async () => {
    const { isAssessmentStageReadyForAutoSend } =
      await import("@/lib/assessments/plan-assessment-ready");
    expect(isAssessmentStageReadyForAutoSend(makeAssessmentStage())).toBe(true);
    expect(
      isAssessmentStageReadyForAutoSend(makeAssessmentStage({ scorecard_template_id: null })),
    ).toBe(false);
    expect(
      isAssessmentStageReadyForAutoSend(makeAssessmentStage({ pipeline_stage_id: null })),
    ).toBe(false);
  });

  it("runPlanAssessmentAutoSend creates assessment and shares when configured", async () => {
    const insertSingle = vi.fn().mockResolvedValue({
      data: {
        id: "asmt-new",
        application_id: "app-1",
        stage_id: "pipe-1",
        reviewer_id: null,
        title: "Take-home exercise",
        status: "pending",
        share_token: "share-tok-abc",
      },
      error: null,
    });
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "applications") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: "app-1" } }),
                }),
              }),
            }),
          };
        }
        if (table === "assessments") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  in: () => ({
                    maybeSingle: async () => ({ data: null }),
                  }),
                }),
              }),
            }),
            insert,
          };
        }
        if (table === "candidates") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    name: "Alex",
                    full_name: "Alex Kim",
                    email: "alex@example.com",
                    phone: null,
                  },
                }),
              }),
            }),
          };
        }
        if (table === "jobs") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { title: "Backend Engineer" } }),
              }),
            }),
          };
        }
        if (table === "feedback_form_templates") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { name: "Engineering take-home" } }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    const { runPlanAssessmentAutoSend } = await import("@/lib/assessments/plan-auto-send");
    await runPlanAssessmentAutoSend(admin as never, {
      planId: "plan-1",
      candidateId: "cand-1",
      jobId: "job-1",
      organisationId: "org-1",
      pipelineStageId: "pipe-1",
      planStage: makeAssessmentStage(),
      initiatedBy: "user-1",
    });

    expect(insert).toHaveBeenCalled();
    expect(mockSendShare).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: ["email"],
        assessmentTitle: "Take-home exercise",
        shareToken: "share-tok-abc",
      }),
    );
    expect(mockLogPlanSystemEvent).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ eventType: "assessment_sent" }),
    );
  });

  it("runPlanAssessmentAutoSend skips when stage is not ready", async () => {
    const admin = { from: vi.fn() };
    const { runPlanAssessmentAutoSend } = await import("@/lib/assessments/plan-auto-send");
    await runPlanAssessmentAutoSend(admin as never, {
      planId: "plan-1",
      candidateId: "cand-1",
      jobId: "job-1",
      organisationId: "org-1",
      pipelineStageId: "pipe-1",
      planStage: makeAssessmentStage({ scorecard_template_id: null }),
    });
    expect(admin.from).not.toHaveBeenCalled();
    expect(mockSendShare).not.toHaveBeenCalled();
  });
});
