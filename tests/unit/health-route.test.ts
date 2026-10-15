import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/observability/route-span", () => ({
  withRouteSpan: (_name: string, fn: () => Promise<unknown>) => fn(),
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  function req(url: string): NextRequest {
    return new NextRequest(url);
  }

  it("returns 200 and ok: true for liveness (no query)", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET(req("http://localhost:3000/api/health"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });

  it("returns JSON with ok field", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET(req("http://localhost:3000/api/health"));
    const body = await response.json();
    expect(body).toHaveProperty("ok");
    expect(typeof body.ok).toBe("boolean");
  });

  it("returns 503 when DB is unavailable (readiness)", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdmin: vi.fn(() => ({
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ error: new Error("connection refused") }),
        })),
      })),
    }));
    vi.resetModules();
    const { GET } = await import("@/app/api/health/route");
    const response = await GET(req("http://localhost:3000/api/health?ready=1"));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("db_unavailable");
  });
});
