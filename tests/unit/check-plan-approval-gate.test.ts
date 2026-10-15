import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertPlanApprovalGateForPipelineMove } from "@/lib/recruitment-plan/check-plan-approval-gate";

vi.mock("@/lib/recruitment-plan/resolve-plan-stage-for-pipeline", () => ({
  resolvePlanStageForPipelineStage: vi.fn(),
}));

vi.mock("@/lib/pipeline-approvals", () => ({
  getDualApprovalStatus: vi.fn(),
}));

import { resolvePlanStageForPipelineStage } from "@/lib/recruitment-plan/resolve-plan-stage-for-pipeline";
import { getDualApprovalStatus } from "@/lib/pipeline-approvals";

const mockResolve = vi.mocked(resolvePlanStageForPipelineStage);
const mockDual = vi.mocked(getDualApprovalStatus);

function adminWithChain(chain: Record<string, unknown>) {
  return {
    from: vi.fn(() => chain),
  } as unknown as SupabaseClient;
}

describe("assertPlanApprovalGateForPipelineMove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows move when no plan stage is linked", async () => {
    mockResolve.mockResolvedValue(null);
    const result = await assertPlanApprovalGateForPipelineMove({} as SupabaseClient, {
      jobId: "job-1",
      pipelineCandidateId: "pc-1",
      targetPipelineStageId: "stage-1",
    });
    expect(result).toEqual({ ok: true });
  });

  it("blocks recruiter_and_hm when dual approval incomplete", async () => {
    mockResolve.mockResolvedValue({
      plan: { id: "plan-1" },
      planStage: { approval_gate: "recruiter_and_hm" },
      pipelineStage: { id: "ps-1", stage_name: "Interview" },
    } as never);
    mockDual.mockResolvedValue({ recruiterApproved: true, hmApproved: false });

    const result = await assertPlanApprovalGateForPipelineMove({} as SupabaseClient, {
      jobId: "job-1",
      pipelineCandidateId: "pc-1",
      targetPipelineStageId: "stage-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Tasks");
    }
  });

  it("allows move when gate is none", async () => {
    mockResolve.mockResolvedValue({
      plan: { id: "plan-1" },
      planStage: { approval_gate: "none" },
      pipelineStage: { id: "ps-1", stage_name: "Screen" },
    } as never);

    const result = await assertPlanApprovalGateForPipelineMove({} as SupabaseClient, {
      jobId: "job-1",
      pipelineCandidateId: "pc-1",
      targetPipelineStageId: "stage-1",
    });
    expect(result).toEqual({ ok: true });
    expect(mockDual).not.toHaveBeenCalled();
  });
});
