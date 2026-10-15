import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockGetJdBaseByJobId = vi.fn().mockResolvedValue(null);
const mockRunHybridFitScorePipeline = vi.fn().mockResolvedValue({
  fitScore: 79,
  fitLabel: "Good Fit",
  fitLabelColor: "#D6E8F7",
  extraction: {},
  explanation: "Hybrid explanation",
  breakdown: {},
  market: { percentile: null, topPct: null, label: "Market data building...", poolSize: 0 },
  idealMatch: { ideal_match_pct: 62, ideal_gaps: ["No Kubernetes"] },
  verdict: {
    label: "Safe Hire",
    icon: "check",
    color: "#16a34a",
    bg: "#dcfce7",
    action: "Interview",
  },
  shadowScore: 70,
  shadowBlend: {},
});

vi.mock("@/lib/fitscore/hybrid", () => ({
  getJdBaseByJobId: (...args: unknown[]) => mockGetJdBaseByJobId(...args),
  runHybridFitScorePipeline: (...args: unknown[]) => mockRunHybridFitScorePipeline(...args),
  prefetchApplicationCompletenessBonusesForJob: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/fitscore/scoring-guard", () => ({
  findRecentFitScoreForDedupe: vi.fn().mockResolvedValue(null),
  tryAcquireFitScoreScoringLock: vi.fn().mockResolvedValue(true),
  releaseFitScoreScoringLock: vi.fn().mockResolvedValue(undefined),
  logFitScoreDedupeSkip: vi.fn(),
  logFitScoreConcurrentSkip: vi.fn(),
  buildDedupeSkipResult: vi.fn(),
}));

describe("numericOverallFromFitScoreServiceResult", () => {
  it("reads fitScore from hybrid results", async () => {
    const { numericOverallFromFitScoreServiceResult } =
      await import("@/lib/services/FitScoreService");
    expect(numericOverallFromFitScoreServiceResult({ fitScore: 71 })).toBe(71);
  });

  it("reads legacy score field", async () => {
    const { numericOverallFromFitScoreServiceResult } =
      await import("@/lib/services/FitScoreService");
    expect(numericOverallFromFitScoreServiceResult({ score: 66 })).toBe(66);
  });

  it("returns null for pending JD objects", async () => {
    const { numericOverallFromFitScoreServiceResult } =
      await import("@/lib/services/FitScoreService");
    expect(
      numericOverallFromFitScoreServiceResult({
        scoring_status: "pending_jd_approval",
        job_id: "j1",
        candidate_id: "c1",
      }),
    ).toBeNull();
  });
});

describe("FitScoreService", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetJdBaseByJobId.mockReset();
    mockGetJdBaseByJobId.mockResolvedValue(null);
    mockRunHybridFitScorePipeline.mockReset();
    mockRunHybridFitScorePipeline.mockResolvedValue({
      fitScore: 79,
      fitLabel: "Good Fit",
      fitLabelColor: "#D6E8F7",
      extraction: {},
      explanation: "Hybrid explanation",
      breakdown: {},
      market: { percentile: null, topPct: null, label: "Market data building...", poolSize: 0 },
      idealMatch: { ideal_match_pct: 62, ideal_gaps: ["No Kubernetes"] },
      verdict: {
        label: "Safe Hire",
        icon: "check",
        color: "#16a34a",
        bg: "#dcfce7",
        action: "Interview",
      },
      shadowScore: 70,
      shadowBlend: {},
    });
  });

  describe("listForJob", () => {
    it("returns scores for a job", async () => {
      const scores = [
        { id: "fs1", overall_score: 90, job_id: "j1", candidate_id: "c1" },
        { id: "fs2", overall_score: 75, job_id: "j1", candidate_id: "c2" },
      ];
      const builder = createMockQueryBuilder({ data: scores });
      const supabase = createMockSupabase({ fit_scores: builder });

      const { FitScoreService } = await import("@/lib/services/FitScoreService");
      const result = await FitScoreService.listForJob(supabase, "j1");
      expect(result).toEqual(scores);
    });
  });

  describe("listForCandidate", () => {
    it("returns scores for a candidate", async () => {
      const scores = [{ id: "fs1", overall_score: 85, job_id: "j1", candidate_id: "c1" }];
      const builder = createMockQueryBuilder({ data: scores });
      const supabase = createMockSupabase({ fit_scores: builder });

      const { FitScoreService } = await import("@/lib/services/FitScoreService");
      const result = await FitScoreService.listForCandidate(supabase, "c1");
      expect(result).toEqual(scores);
    });
  });

  describe("listForOrg", () => {
    it("fetches job IDs then scores", async () => {
      const jobBuilder = createMockQueryBuilder({
        data: [{ id: "j1" }, { id: "j2" }],
      });
      const scoreBuilder = createMockQueryBuilder({
        data: [{ id: "fs1", job_id: "j1", candidate_id: "c1", overall_score: 80 }],
      });
      const supabase = createMockSupabase({
        jobs: jobBuilder,
        fit_scores: scoreBuilder,
      });

      const { FitScoreService } = await import("@/lib/services/FitScoreService");
      const result = await FitScoreService.listForOrg(supabase, "org-1");
      expect(supabase.from).toHaveBeenCalledWith("jobs");
      expect(supabase.from).toHaveBeenCalledWith("fit_scores");
      expect(result).toEqual([{ id: "fs1", job_id: "j1", candidate_id: "c1", overall_score: 80 }]);
    });

    it("returns empty array when org has no jobs", async () => {
      const jobBuilder = createMockQueryBuilder({ data: [] });
      const supabase = createMockSupabase({ jobs: jobBuilder });

      const { FitScoreService } = await import("@/lib/services/FitScoreService");
      const result = await FitScoreService.listForOrg(supabase, "org-empty");
      expect(result).toEqual([]);
    });
  });

  describe("computeSingle", () => {
    it("queues pending when JD Base is unapproved", async () => {
      const jobBuilder = createMockQueryBuilder({
        data: { id: "j1", title: "Engineer" },
      });
      const candidateBuilder = createMockQueryBuilder({
        data: { id: "c1", name: "Jane" },
      });
      const supabase = createMockSupabase({
        jobs: jobBuilder,
        candidates: candidateBuilder,
      });

      const { FitScoreService } = await import("@/lib/services/FitScoreService");
      const result = await FitScoreService.computeSingle(supabase, "j1", "c1");
      expect(result).toMatchObject({
        scoring_status: "pending_jd_approval",
        job_id: "j1",
        candidate_id: "c1",
      });
    });

    it("throws when job not found", async () => {
      const jobBuilder = createMockQueryBuilder({ data: null });
      const candidateBuilder = createMockQueryBuilder({ data: { id: "c1" } });
      const supabase = createMockSupabase({
        jobs: jobBuilder,
        candidates: candidateBuilder,
      });

      const { FitScoreService } = await import("@/lib/services/FitScoreService");
      await expect(FitScoreService.computeSingle(supabase, "j-bad", "c1")).rejects.toThrow(
        "Job not found",
      );
    });

    it("throws when candidate not found", async () => {
      const jobBuilder = createMockQueryBuilder({ data: { id: "j1" } });
      const candidateBuilder = createMockQueryBuilder({ data: null });
      const supabase = createMockSupabase({
        jobs: jobBuilder,
        candidates: candidateBuilder,
      });

      const { FitScoreService } = await import("@/lib/services/FitScoreService");
      await expect(FitScoreService.computeSingle(supabase, "j1", "c-bad")).rejects.toThrow(
        "Candidate not found",
      );
    });

    it("skips Claude when recent score exists and force is false", async () => {
      const { findRecentFitScoreForDedupe, buildDedupeSkipResult } =
        await import("@/lib/fitscore/scoring-guard");
      vi.mocked(findRecentFitScoreForDedupe).mockResolvedValueOnce({
        id: "fs-dup",
        job_id: "j1",
        candidate_id: "c1",
        overall_score: 66,
        band: "Moderate",
        one_line_summary: "dup",
        scoring_status: "scored",
        created_at: new Date().toISOString(),
      });
      vi.mocked(buildDedupeSkipResult).mockReturnValueOnce({
        scoring_status: "deduped",
        job_id: "j1",
        candidate_id: "c1",
        fitScore: 66,
        deduped: true,
      });

      const jobBuilder = createMockQueryBuilder({ data: { id: "j1" } });
      const candidateBuilder = createMockQueryBuilder({ data: { id: "c1" } });
      const supabase = createMockSupabase({
        jobs: jobBuilder,
        candidates: candidateBuilder,
      });

      const { FitScoreService } = await import("@/lib/services/FitScoreService");
      const result = await FitScoreService.computeSingle(supabase, "j1", "c1", {
        source: "upload",
      });
      expect(mockRunHybridFitScorePipeline).not.toHaveBeenCalled();
      expect(result).toMatchObject({ scoring_status: "deduped", fitScore: 66 });
    });

    it("uses hybrid pipeline when JD Base is approved", async () => {
      mockGetJdBaseByJobId.mockResolvedValue({
        id: "jdb-1",
        jobId: "j1",
        approvedBy: "user-1",
        weights: {},
        fitThresholds: {},
        scoreFloor: 15,
      });
      const jobBuilder = createMockQueryBuilder({
        data: { id: "j1", title: "Engineer" },
      });
      const candidateBuilder = createMockQueryBuilder({
        data: { id: "c1", name: "Jane" },
      });
      const supabase = createMockSupabase({
        jobs: jobBuilder,
        candidates: candidateBuilder,
      });

      const { FitScoreService } = await import("@/lib/services/FitScoreService");
      const result = await FitScoreService.computeSingle(supabase, "j1", "c1");
      expect(mockRunHybridFitScorePipeline).toHaveBeenCalledOnce();
      expect(result).toMatchObject({ fitScore: 79 });
    });
  });

  describe("computeBatch", () => {
    it("queues batch pending when JD Base is unapproved", async () => {
      const jobBuilder = createMockQueryBuilder({
        data: { id: "j1", title: "Engineer" },
      });
      const candidateBuilder = createMockQueryBuilder({
        data: [{ id: "c1" }, { id: "c2" }],
      });
      const supabase = createMockSupabase({
        jobs: jobBuilder,
        candidates: candidateBuilder,
      });

      const { FitScoreService } = await import("@/lib/services/FitScoreService");
      const result = await FitScoreService.computeBatch(supabase, "j1", ["c1", "c2"]);
      expect(result.status).toBe("pending_jd_approval");
      expect(result.scored).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("throws when job not found", async () => {
      const jobBuilder = createMockQueryBuilder({ data: null });
      const supabase = createMockSupabase({ jobs: jobBuilder });

      const { FitScoreService } = await import("@/lib/services/FitScoreService");
      await expect(FitScoreService.computeBatch(supabase, "j-bad", ["c1"])).rejects.toThrow(
        "Job not found",
      );
    });

    it("throws when no candidates found", async () => {
      const jobBuilder = createMockQueryBuilder({ data: { id: "j1" } });
      const candidateBuilder = createMockQueryBuilder({ data: [] });
      const supabase = createMockSupabase({
        jobs: jobBuilder,
        candidates: candidateBuilder,
      });

      const { FitScoreService } = await import("@/lib/services/FitScoreService");
      await expect(FitScoreService.computeBatch(supabase, "j1", [])).rejects.toThrow(
        "No candidates found",
      );
    });

    it("routes batch scoring through hybrid when JD Base is approved", async () => {
      mockGetJdBaseByJobId.mockResolvedValue({
        id: "jdb-1",
        jobId: "j1",
        approvedBy: "user-1",
        weights: {},
        fitThresholds: {},
        scoreFloor: 15,
      });
      const jobBuilder = createMockQueryBuilder({
        data: { id: "j1", title: "Engineer" },
      });
      const candidateBuilder = createMockQueryBuilder({
        data: [{ id: "c1" }, { id: "c2" }],
      });
      const supabase = createMockSupabase({
        jobs: jobBuilder,
        candidates: candidateBuilder,
      });

      const { FitScoreService } = await import("@/lib/services/FitScoreService");
      const result = await FitScoreService.computeBatch(supabase, "j1", ["c1", "c2"]);
      expect(result.scored).toBe(2);
      expect(mockRunHybridFitScorePipeline).toHaveBeenCalledTimes(2);
    });
  });
});
