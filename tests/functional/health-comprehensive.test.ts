import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/observability/route-span", () => ({
  withRouteSpan: (_name: string, fn: () => Promise<unknown>) => fn(),
}));

const mockSupabaseQuery = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        limit: () => ({
          maybeSingle: mockSupabaseQuery,
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/redis", () => ({
  checkRedis: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/redis/cache", () => ({
  getCacheMetrics: vi.fn().mockReturnValue({ hits: 100, misses: 10, ratio: 0.91 }),
}));

vi.mock("@/lib/config/env", () => ({
  env: {
    stripeSecretKey: null,
    anthropicApiKey: null,
    whatsappAccessToken: "",
    whatsappPhoneNumberId: "",
  },
}));

describe("Health Endpoint — Comprehensive Functional Tests", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabaseQuery.mockReset();
  });

  describe("Liveness probe", () => {
    it("returns 200 with ok:true for basic health check", async () => {
      const { GET } = await import("@/app/api/health/route");
      const res = await GET(new NextRequest("http://localhost:3000/api/health"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it("does not query database for liveness probe", async () => {
      const { GET } = await import("@/app/api/health/route");
      await GET(new NextRequest("http://localhost:3000/api/health"));
      expect(mockSupabaseQuery).not.toHaveBeenCalled();
    });
  });

  describe("Readiness probe", () => {
    it("returns 200 when DB is available", async () => {
      mockSupabaseQuery.mockResolvedValue({ error: null });
      const { GET } = await import("@/app/api/health/route");
      const res = await GET(new NextRequest("http://localhost:3000/api/health?ready=1"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it("returns 503 when DB is unavailable", async () => {
      mockSupabaseQuery.mockResolvedValue({
        error: new Error("connection refused"),
      });
      const { GET } = await import("@/app/api/health/route");
      const res = await GET(new NextRequest("http://localhost:3000/api/health?ready=1"));
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toBe("db_unavailable");
    });

    it("returns 503 when DB query throws", async () => {
      mockSupabaseQuery.mockRejectedValue(new Error("timeout"));
      const { GET } = await import("@/app/api/health/route");
      const res = await GET(new NextRequest("http://localhost:3000/api/health?ready=1"));
      expect(res.status).toBe(503);
    });

    it("includes cache metrics in readiness response", async () => {
      mockSupabaseQuery.mockResolvedValue({ error: null });
      const { GET } = await import("@/app/api/health/route");
      const res = await GET(new NextRequest("http://localhost:3000/api/health?ready=1"));
      const body = await res.json();
      expect(body.cache).toBeDefined();
      expect(body.cache.hits).toBeGreaterThan(0);
    });
  });

  describe("Dependencies probe", () => {
    it("includes deps object when deps=1", async () => {
      mockSupabaseQuery.mockResolvedValue({ error: null });
      const { GET } = await import("@/app/api/health/route");
      const res = await GET(new NextRequest("http://localhost:3000/api/health?ready=1&deps=1"));
      const body = await res.json();
      expect(body.deps).toBeDefined();
      expect(body.deps).toHaveProperty("stripe");
      expect(body.deps).toHaveProperty("anthropic");
      expect(body.deps).toHaveProperty("whatsapp");
      expect(body.deps).toHaveProperty("redis");
    });
  });

  describe("Response format", () => {
    it("returns JSON content type", async () => {
      const { GET } = await import("@/app/api/health/route");
      const res = await GET(new NextRequest("http://localhost:3000/api/health"));
      expect(res.headers.get("content-type")).toContain("application/json");
    });
  });
});
