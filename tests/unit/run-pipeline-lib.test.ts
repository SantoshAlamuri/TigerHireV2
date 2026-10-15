import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockRunJd = vi.hoisted(() => vi.fn());
const mockGhostbuster = vi.hoisted(() => vi.fn());
const mockScreen = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agents/jd-intelligence", () => ({
  runJdIntelligence: (...args: unknown[]) => mockRunJd(...args),
}));
vi.mock("@/lib/agents/ghostbuster-authenticity", () => ({
  runGhostbuster: (...args: unknown[]) => mockGhostbuster(...args),
}));
vi.mock("@/lib/agents/screening", () => ({
  runScreening: (...args: unknown[]) => mockScreen(...args),
}));

import { resolveCandidateIdsForJob, runPipelineForJob } from "@/lib/agents/run-pipeline";

const JOB = "11111111-1111-4111-8111-111111111111";
const C1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("resolveCandidateIdsForJob", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockFrom.mockImplementation((table: string) => {
      const rows =
        table === "pipeline_candidates"
          ? [{ candidate_id: C1 }, { candidate_id: C1 }]
          : table === "applications"
            ? [{ candidate_id: C2 }, { candidate_id: C1 }]
            : table === "fit_scores"
              ? [{ candidate_id: C3 }, { candidate_id: C2 }]
              : [];
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      };
    });
  });

  it("dedupes in pipeline → applications → fit_scores order and respects maxCandidates", async () => {
    const { ids, pool } = await resolveCandidateIdsForJob(JOB, 2);
    expect(ids).toEqual([C1, C2]);
    expect(pool.pipeline).toBe(1);
    expect(pool.applications).toBe(2);
    expect(pool.fitScores).toBe(2);
    expect(pool.selected).toBe(2);
  });

  it("throws when pipeline_candidates query fails", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "pipeline_candidates") {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: null, error: { message: "boom" } }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      };
    });
    await expect(resolveCandidateIdsForJob(JOB, 10)).rejects.toThrow(/pipeline candidates/);
  });
});

describe("runPipelineForJob", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRunJd.mockReset();
    mockGhostbuster.mockReset();
    mockScreen.mockReset();

    mockFrom.mockImplementation((table: string) => {
      const rows = table === "pipeline_candidates" ? [{ candidate_id: C1 }] : [];
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      };
    });
    mockRunJd.mockResolvedValue({ jobId: JOB, rubric: {}, sectionsUpdated: true });
  });

  it("increments approved when authenticity check clears and score is high", async () => {
    mockGhostbuster.mockResolvedValue({ candidateId: C1, riskScore: 10, flags: [], summary: "" });
    mockScreen.mockResolvedValue({
      candidateId: C1,
      jobId: JOB,
      overallScore: 85,
      band: "Strong Fit",
      greenFlags: [],
      redFlags: [],
      amberFlags: [],
      interviewAngles: [],
      summary: "",
      alreadyExisted: false,
    });

    const result = await runPipelineForJob(JOB, { maxCandidates: 10 });

    expect(mockRunJd).toHaveBeenCalledWith(JOB);
    expect(mockGhostbuster).toHaveBeenCalledWith(C1);
    expect(mockScreen).toHaveBeenCalledWith(C1, JOB, { forceRescore: false });
    expect(result.candidatesProcessed).toBe(1);
    expect(result.approved).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.belowThreshold).toBe(0);
    expect(result.candidatePool?.selected).toBe(1);
  });

  it("counts rejected when authenticity threshold is high (no screening)", async () => {
    mockGhostbuster.mockResolvedValue({ candidateId: C1, riskScore: 80, flags: [], summary: "" });

    const result = await runPipelineForJob(JOB);

    expect(mockScreen).not.toHaveBeenCalled();
    expect(result.rejected).toBe(1);
    expect(result.approved).toBe(0);
    expect(result.belowThreshold).toBe(0);
  });

  it("records jd_intelligence errors but still processes candidates", async () => {
    mockRunJd.mockRejectedValue(new Error("no description"));
    mockGhostbuster.mockResolvedValue({ candidateId: C1, riskScore: 0, flags: [], summary: "" });
    mockScreen.mockResolvedValue({
      candidateId: C1,
      jobId: JOB,
      overallScore: 50,
      band: "Moderate Fit",
      greenFlags: [],
      redFlags: [],
      amberFlags: [],
      interviewAngles: [],
      summary: "",
      alreadyExisted: false,
    });

    const result = await runPipelineForJob(JOB);

    expect(result.errors.some((e) => e.includes("jd_intelligence"))).toBe(true);
    expect(result.belowThreshold).toBe(1);
  });
});
