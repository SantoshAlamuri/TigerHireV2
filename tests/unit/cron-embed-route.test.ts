import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockValidateCronSecret = vi.fn();
const mockEmbedAllCandidates = vi.fn();
const mockEmbedAllJobs = vi.fn();
const mockReportError = vi.fn();

vi.mock("@/lib/security/cron-auth", () => ({
  validateCronSecret: (...args: unknown[]) => mockValidateCronSecret(...args),
}));

vi.mock("@/lib/services/embeddings", () => ({
  embedAllCandidates: (...args: unknown[]) => mockEmbedAllCandidates(...args),
  embedAllJobs: (...args: unknown[]) => mockEmbedAllJobs(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

describe("POST /api/cron/embed", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockValidateCronSecret.mockResolvedValue(true);
    mockEmbedAllCandidates.mockResolvedValue({ processed: 2, skipped: 0 });
    mockEmbedAllJobs.mockResolvedValue({ processed: 1, skipped: 0 });
  });

  it("returns 401 when cron secret is invalid", async () => {
    mockValidateCronSecret.mockResolvedValue(false);
    const { POST } = await import("@/app/api/cron/embed/route");
    const req = new NextRequest("http://localhost:3000/api/cron/embed", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockEmbedAllCandidates).not.toHaveBeenCalled();
  });

  it("returns 200 with candidate and job embedding results", async () => {
    const { POST } = await import("@/app/api/cron/embed/route");
    const req = new NextRequest("http://localhost:3000/api/cron/embed", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toEqual({ processed: 2, skipped: 0 });
    expect(body.jobs).toEqual({ processed: 1, skipped: 0 });
    expect(mockEmbedAllCandidates).toHaveBeenCalledWith(50);
    expect(mockEmbedAllJobs).toHaveBeenCalledWith(50);
  });

  it("returns 500 when embedding batch throws", async () => {
    mockEmbedAllCandidates.mockRejectedValue(new Error("boom"));
    const { POST } = await import("@/app/api/cron/embed/route");
    const req = new NextRequest("http://localhost:3000/api/cron/embed", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Embedding batch failed");
    expect(mockReportError).toHaveBeenCalled();
  });

  it("exports GET alias with same handler as POST", async () => {
    const route = await import("@/app/api/cron/embed/route");
    expect(route.GET).toBe(route.POST);
  });
});
