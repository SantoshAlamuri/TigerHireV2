import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockValidateCronSecret = vi.fn();
const mockRecalculateTrustScore = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/security/cron-auth", () => ({
  validateCronSecret: (...args: unknown[]) => mockValidateCronSecret(...args),
}));

vi.mock("@/lib/agents/trust-score", () => ({
  recalculateTrustScore: (...args: unknown[]) => mockRecalculateTrustScore(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

describe("POST/GET /api/cron/trust", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockValidateCronSecret.mockResolvedValue(true);
    mockRecalculateTrustScore.mockResolvedValue(undefined);
    mockFrom.mockImplementation((table: string) => {
      if (table === "vouches") {
        return {
          select: vi.fn(() => ({
            gte: vi.fn().mockResolvedValue({
              data: [{ candidate_id: "candidate-1" }, { candidate_id: "candidate-2" }],
            }),
          })),
        };
      }
      if (table === "verification_claims") {
        return {
          select: vi.fn(() => ({
            gte: vi.fn().mockResolvedValue({
              data: [{ candidate_id: "candidate-2" }, { candidate_id: "candidate-3" }],
            }),
          })),
        };
      }
      return {
        select: vi.fn(() => ({ gte: vi.fn().mockResolvedValue({ data: [] }) })),
      };
    });
  });

  it("returns 401 when cron secret is invalid", async () => {
    mockValidateCronSecret.mockResolvedValue(false);
    const { POST } = await import("@/app/api/cron/trust/route");
    const req = new NextRequest("http://localhost:3000/api/cron/trust", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("recalculates unique candidate trust scores and returns counts", async () => {
    const { POST } = await import("@/app/api/cron/trust/route");
    const req = new NextRequest("http://localhost:3000/api/cron/trust", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(3);
    expect(body.candidateIds).toBe(3);
    expect(mockRecalculateTrustScore).toHaveBeenCalledTimes(3);
  });

  it("supports GET alias and executes same trust refresh flow", async () => {
    const { GET } = await import("@/app/api/cron/trust/route");
    const req = new NextRequest("http://localhost:3000/api/cron/trust");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(3);
    expect(body.candidateIds).toBe(3);
    expect(mockRecalculateTrustScore).toHaveBeenCalledTimes(3);
  });
});
