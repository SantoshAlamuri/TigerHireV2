import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { advancePipelineToFitScoreReviewAfterScoring } from "@/lib/pipeline/advance-after-fitscore";

const adminFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: adminFrom }),
}));

vi.mock("@/lib/recruitment-plan/plan-stage-dispatch", () => ({
  dispatchPlanStageOnCandidateMove: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/analytics/log-pipeline-stage-transition", () => ({
  logPipelineStageTransition: vi.fn(),
}));

const appliedId = "stage-applied";
const fitScoreId = "stage-fitscore";
const phoneScreenId = "stage-phone";
const interviewId = "stage-interview";

function buildAdmin(options: {
  pc?: { id: string; stage_id: string | null } | null;
  stages?: Array<{ id: string; stage_name: string; stage_order: number }>;
  updateError?: string;
}) {
  const stages = options.stages ?? [
    { id: appliedId, stage_name: "Applied", stage_order: 0 },
    { id: fitScoreId, stage_name: "FitScore Review", stage_order: 1 },
    { id: interviewId, stage_name: "Interview", stage_order: 2 },
  ];

  const update = vi.fn().mockReturnValue({
    eq: vi
      .fn()
      .mockResolvedValue(
        options.updateError ? { error: { message: options.updateError } } : { error: null },
      ),
  });

  adminFrom.mockImplementation((table: string) => {
    if (table === "pipeline_candidates") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: options.pc ? [options.pc] : [],
                  error: null,
                }),
              }),
            }),
          }),
        }),
        update,
      };
    }
    if (table === "pipeline_stages") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: stages, error: null }),
          }),
        }),
      };
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    };
  });

  return { update };
}

describe("advancePipelineToFitScoreReviewAfterScoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminFrom.mockReset();
  });

  it("skips test runs", async () => {
    buildAdmin({});
    const result = await advancePipelineToFitScoreReviewAfterScoring({} as SupabaseClient, {
      jobId: "job-1",
      candidateId: "cand-1",
      isTestRun: true,
    });
    expect(result).toEqual({ advanced: false, reason: "test_run" });
  });

  it("advances from Applied to FitScore Review", async () => {
    const { update } = buildAdmin({
      pc: { id: "pc-1", stage_id: appliedId },
    });
    const result = await advancePipelineToFitScoreReviewAfterScoring({} as SupabaseClient, {
      jobId: "job-1",
      candidateId: "cand-1",
      organisationId: "org-1",
    });
    expect(result).toEqual({
      advanced: true,
      fromStage: "Applied",
      toStage: "FitScore Review",
    });
    expect(update).toHaveBeenCalledWith({ stage_id: fitScoreId });
  });

  it("falls back to next stage after Applied when FitScore Review is missing", async () => {
    const { update } = buildAdmin({
      pc: { id: "pc-1", stage_id: appliedId },
      stages: [
        { id: appliedId, stage_name: "Applied", stage_order: 0 },
        { id: phoneScreenId, stage_name: "Phone screen", stage_order: 1 },
        { id: interviewId, stage_name: "Technical interview", stage_order: 2 },
      ],
    });
    const result = await advancePipelineToFitScoreReviewAfterScoring({} as SupabaseClient, {
      jobId: "job-1",
      candidateId: "cand-1",
    });
    expect(result).toEqual({
      advanced: true,
      fromStage: "Applied",
      toStage: "Phone screen",
    });
    expect(update).toHaveBeenCalledWith({ stage_id: phoneScreenId });
  });

  it("does not move backward from Interview", async () => {
    const { update } = buildAdmin({
      pc: { id: "pc-1", stage_id: interviewId },
    });
    const result = await advancePipelineToFitScoreReviewAfterScoring({} as SupabaseClient, {
      jobId: "job-1",
      candidateId: "cand-1",
    });
    expect(result.advanced).toBe(false);
    expect(result.reason).toMatch(/not_on_applied|already_past/);
    expect(update).not.toHaveBeenCalled();
  });

  it("is idempotent when already on post-score stage", async () => {
    const { update } = buildAdmin({
      pc: { id: "pc-1", stage_id: fitScoreId },
    });
    const result = await advancePipelineToFitScoreReviewAfterScoring({} as SupabaseClient, {
      jobId: "job-1",
      candidateId: "cand-1",
    });
    expect(result).toEqual({ advanced: false, reason: "already_at_post_score_stage" });
    expect(update).not.toHaveBeenCalled();
  });
});
