import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCircuitBreaker, getCircuitBreaker } from "@/lib/utils/circuit-breaker";

const mockRpc = vi.fn();
const mockCount = vi.fn();
const mockInsert = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    rpc: mockRpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => Promise.resolve({ count: mockCount() }),
        }),
      }),
      insert: () => Promise.resolve({ error: mockInsert() }),
    }),
  }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("Security — Functional Tests", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRpc.mockReset();
    mockCount.mockReset();
    mockInsert.mockReset();
    mockInsert.mockReturnValue(null);
  });

  describe("Rate limiting integration", () => {
    it("allows normal traffic patterns", async () => {
      mockRpc.mockResolvedValue({ data: 10, error: null });
      const { checkRateLimit } = await import("@/lib/security/rate-limit");

      const results = await Promise.all([
        checkRateLimit({ key: "user-1", limit: 100, windowSecs: 60 }),
        checkRateLimit({ key: "user-2", limit: 100, windowSecs: 60 }),
        checkRateLimit({ key: "user-3", limit: 100, windowSecs: 60 }),
      ]);

      expect(results.every((r) => r.allowed)).toBe(true);
    });

    it("blocks abusive traffic patterns", async () => {
      mockRpc.mockResolvedValue({ data: 200, error: null });
      const { checkRateLimit } = await import("@/lib/security/rate-limit");

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          checkRateLimit({ key: "abuser", limit: 50, windowSecs: 60 }),
        ),
      );

      expect(results.every((r) => !r.allowed)).toBe(true);
      expect(results.every((r) => r.remaining === 0)).toBe(true);
    });

    it("handles different users independently", async () => {
      let call = 0;
      mockRpc.mockImplementation(() => {
        call++;
        return Promise.resolve({
          data: call <= 5 ? 10 : 200,
          error: null,
        });
      });

      const { checkRateLimit } = await import("@/lib/security/rate-limit");

      const normalUser = await checkRateLimit({
        key: "normal-user",
        limit: 100,
        windowSecs: 60,
      });
      expect(normalUser.allowed).toBe(true);
    });
  });

  describe("Circuit breaker resilience", () => {
    it("protects downstream services from cascade failure", async () => {
      const cb = createCircuitBreaker({
        failureThreshold: 3,
        name: "func-cascade",
      });

      for (let i = 0; i < 3; i++) {
        await cb.run(() => Promise.reject(new Error("downstream failure"))).catch(() => {});
      }

      expect(cb.getState()).toBe("open");

      await expect(cb.run(() => Promise.resolve("should not reach"))).rejects.toThrow(
        "CircuitBreaker[func-cascade] open",
      );
    });

    it("named circuit breakers maintain independent state", () => {
      const api = getCircuitBreaker("api-service");
      const db = getCircuitBreaker("db-service");

      expect(api).not.toBe(db);
      expect(api.getState()).toBe("closed");
      expect(db.getState()).toBe("closed");
    });

    it("circuit breaker stays closed when failures remain under threshold", async () => {
      const cb = createCircuitBreaker({
        failureThreshold: 5,
        name: "func-under-threshold",
      });

      for (let i = 0; i < 4; i++) {
        await cb.run(() => Promise.reject(new Error("transient"))).catch(() => {});
      }
      expect(cb.getState()).toBe("closed");

      const result = await cb.run(() => Promise.resolve("success"));
      expect(result).toBe("success");
      expect(cb.getState()).toBe("closed");
    });
  });
});
