import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSendEmail = vi.fn().mockResolvedValue({ id: "email-1" });
const mockSendTemplate = vi.fn().mockResolvedValue({ success: true });

vi.mock("@/lib/services/resend", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendTemplateMessage: (...args: unknown[]) => mockSendTemplate(...args),
}));

vi.mock("@/lib/recruitment-plan/plan-auto-execute-flags", () => ({
  isPlanAutoExecuteEnabled: () => true,
}));

vi.mock("@/lib/recruitment-plan/resolve-plan-stage-for-pipeline", () => ({
  resolvePlanStageForPipelineStage: vi.fn().mockResolvedValue({
    plan: { id: "plan-1" },
    planStage: {
      id: "ps-1",
      display_name: "Phone screen",
      stage_type: "screen",
      comms_template: "stage_entered_email",
    },
    pipelineStage: { id: "stage-1", stage_name: "Phone screen" },
  }),
}));

vi.mock("@/lib/recruitment-plan/plan-history-log", () => ({
  logPlanSystemEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/screening/trigger", () => ({
  triggerScreeningAfterFitScore: vi.fn().mockResolvedValue(undefined),
}));

const mockAdminFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  }),
}));

describe("dispatchPlanStageOnCandidateMove email v1", () => {
  beforeEach(() => {
    mockSendEmail.mockClear();
    mockSendTemplate.mockClear();
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "candidates") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  phone: null,
                  email: "candidate@example.com",
                  name: "Jane",
                  full_name: "Jane Doe",
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
      if (table === "plan_candidate_stage_tracking") {
        return { upsert: async () => ({ error: null }) };
      }
      return { upsert: async () => ({ error: null }) };
    });
  });

  it("sends email when comms template is not a WhatsApp template id", async () => {
    const { dispatchPlanStageOnCandidateMove } =
      await import("@/lib/recruitment-plan/plan-stage-dispatch");

    await dispatchPlanStageOnCandidateMove({
      jobId: "job-1",
      organisationId: "org-1",
      pipelineCandidateId: "pc-1",
      candidateId: "cand-1",
      pipelineStageId: "stage-1",
    });

    expect(mockSendEmail).toHaveBeenCalled();
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });
});
