import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockValidateCronSecret = vi.fn();
vi.mock("@/lib/security/cron-auth", () => ({
  validateCronSecret: (req: unknown) => mockValidateCronSecret(req),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: vi.fn(() => {
      const p = Promise.resolve({ data: [], error: null });
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        then: (fn?: (v: unknown) => unknown) => p.then(fn),
      };
    }),
  }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/observability/report-error", () => ({ reportError: vi.fn() }));

describe("GET /api/cron/resignations", () => {
  beforeEach(() => {
    mockValidateCronSecret.mockReset();
  });

  it("returns 401 when cron secret is invalid", async () => {
    mockValidateCronSecret.mockReturnValue(false);
    const { GET } = await import("@/app/api/cron/resignations/route");
    const req = new NextRequest("http://localhost:3000/api/cron/resignations");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with processed count when secret valid", async () => {
    mockValidateCronSecret.mockReturnValue(true);
    const { GET } = await import("@/app/api/cron/resignations/route");
    const req = new NextRequest("http://localhost:3000/api/cron/resignations");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("processed");
  });
});
