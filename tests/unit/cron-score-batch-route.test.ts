import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockValidateCronSecret = vi.fn();
const mockAcquireCronLease = vi.fn();
const mockReleaseCronLease = vi.fn();
const mockRunFitScoreBatchAgent = vi.fn();
const mockReportError = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock("@/lib/security/cron-auth", () => ({
  validateCronSecret: (...args: unknown[]) => mockValidateCronSecret(...args),
}));

vi.mock("@/lib/security/cron-lease", () => ({
  acquireCronLease: (...args: unknown[]) => mockAcquireCronLease(...args),
  releaseCronLease: (...args: unknown[]) => mockReleaseCronLease(...args),
}));

vi.mock("@/lib/agents/fitscore-agent", () => ({
  runFitScoreBatchAgent: (...args: unknown[]) => mockRunFitScoreBatchAgent(...args),
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  }),
}));

function buildCronRunsBuilder(runId = "run-1") {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: runId }, error: null }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  };
}

describe("POST /api/cron/score-batch", () => {
  beforeEach(() => {
    vi.resetModules();
    mockValidateCronSecret.mockReset();
    mockAcquireCronLease.mockReset();
    mockReleaseCronLease.mockReset();
    mockRunFitScoreBatchAgent.mockReset();
    mockReportError.mockReset();
    mockAdminFrom.mockReset();

    mockValidateCronSecret.mockResolvedValue(true);
    mockAcquireCronLease.mockResolvedValue("owner-1");
    mockRunFitScoreBatchAgent.mockResolvedValue({
      runId: "batch-1",
      recordsProcessed: 12,
      recordsCreated: 7,
      errors: [],
    });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "cron_runs") return buildCronRunsBuilder();
      return { select: vi.fn(), update: vi.fn(), insert: vi.fn() };
    });
  });

  it("returns 401 when cron secret is invalid", async () => {
    mockValidateCronSecret.mockResolvedValue(false);
    const { POST } = await import("@/app/api/cron/score-batch/route");
    const req = new NextRequest("http://localhost:3000/api/cron/score-batch", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockAcquireCronLease).not.toHaveBeenCalled();
  });

  it("returns skipped payload when lease is already held", async () => {
    mockAcquireCronLease.mockResolvedValue(null);
    const { POST } = await import("@/app/api/cron/score-batch/route");
    const req = new NextRequest("http://localhost:3000/api/cron/score-batch", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("lock-held");
    expect(mockRunFitScoreBatchAgent).not.toHaveBeenCalled();
    expect(mockReleaseCronLease).not.toHaveBeenCalled();
  });

  it("releases lease and returns success payload on completion", async () => {
    const { POST } = await import("@/app/api/cron/score-batch/route");
    const req = new NextRequest("http://localhost:3000/api/cron/score-batch", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runId).toBe("batch-1");
    expect(body.processed).toBe(12);
    expect(mockReleaseCronLease).toHaveBeenCalledWith("score-batch", "owner-1");
  });

  it("releases lease and reports error when scoring fails", async () => {
    mockRunFitScoreBatchAgent.mockRejectedValue(new Error("boom"));
    const { POST } = await import("@/app/api/cron/score-batch/route");
    const req = new NextRequest("http://localhost:3000/api/cron/score-batch", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(mockReportError).toHaveBeenCalled();
    expect(mockReleaseCronLease).toHaveBeenCalledWith("score-batch", "owner-1");
  });
});
