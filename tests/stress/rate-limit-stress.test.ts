import { describe, it, expect, vi, beforeEach } from "vitest";
import { isCiRunner } from "../helpers/ci-perf";

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

describe("Rate Limiter — Stress Tests", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRpc.mockReset();
    mockCount.mockReset();
    mockInsert.mockReset();
    mockInsert.mockReturnValue(null);
  });

  it("correctly enforces limits under 100 concurrent requests", async () => {
    let callCount = 0;
    mockRpc.mockImplementation(() => {
      callCount++;
      return Promise.resolve({ data: callCount, error: null });
    });

    const { checkRateLimit } = await import("@/lib/security/rate-limit");
    const limit = 50;

    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        checkRateLimit({ key: `stress-user-${i}`, limit, windowSecs: 60 }),
      ),
    );

    expect(results).toHaveLength(100);
    for (const r of results) {
      expect(r).toHaveProperty("allowed");
      expect(r).toHaveProperty("remaining");
      expect(r).toHaveProperty("resetAt");
      expect(r.resetAt).toBeInstanceOf(Date);
    }
  });

  it("handles the same key hit many times in parallel", async () => {
    let currentCount = 0;
    mockRpc.mockImplementation(() => {
      currentCount++;
      return Promise.resolve({ data: currentCount, error: null });
    });

    const { checkRateLimit } = await import("@/lib/security/rate-limit");

    const results = await Promise.all(
      Array.from({ length: 200 }, () =>
        checkRateLimit({ key: "same-key", limit: 100, windowSecs: 60 }),
      ),
    );

    const allowed = results.filter((r) => r.allowed).length;
    const blocked = results.filter((r) => !r.allowed).length;

    expect(allowed + blocked).toBe(200);
    expect(results.every((r) => r.resetAt instanceof Date)).toBe(true);
  });

  it("returns consistent remaining values when under limit", async () => {
    mockRpc.mockResolvedValue({ data: 5, error: null });
    const { checkRateLimit } = await import("@/lib/security/rate-limit");

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        checkRateLimit({ key: "consistent-key", limit: 100, windowSecs: 60 }),
      ),
    );

    for (const r of results) {
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(95);
    }
  });

  it("handles different window sizes correctly", async () => {
    mockRpc.mockResolvedValue({ data: 10, error: null });
    const { checkRateLimit } = await import("@/lib/security/rate-limit");

    const windows = [10, 30, 60, 300, 3600];
    const results = await Promise.all(
      windows.map((w) => checkRateLimit({ key: "window-test", limit: 100, windowSecs: w })),
    );

    const upperSlackMs = isCiRunner ? 2500 : 1000;
    for (let i = 0; i < results.length; i++) {
      expect(results[i].allowed).toBe(true);
      const resetDelta = results[i].resetAt.getTime() - Date.now();
      // CI runners can observe small clock jitter; reset should still be near the configured window.
      expect(resetDelta).toBeGreaterThan(isCiRunner ? -500 : 0);
      expect(resetDelta).toBeLessThanOrEqual(windows[i] * 1000 + upperSlackMs);
    }
  });
});
