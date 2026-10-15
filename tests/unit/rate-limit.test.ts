import { describe, it, expect, beforeEach, vi } from "vitest";

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

describe("rate limiter (security/rate-limit)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRpc.mockReset();
    mockCount.mockReset();
    mockInsert.mockReset();
    mockInsert.mockReturnValue(null);
  });

  it("allows requests within the limit", async () => {
    mockRpc.mockResolvedValue({ data: 1, error: null });
    const { checkRateLimit } = await import("@/lib/security/rate-limit");
    const result = await checkRateLimit({
      key: "test-user",
      limit: 5,
      windowSecs: 60,
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks requests exceeding the limit", async () => {
    mockRpc.mockResolvedValue({ data: 6, error: null });
    const { checkRateLimit } = await import("@/lib/security/rate-limit");
    const result = await checkRateLimit({
      key: "block-test",
      limit: 5,
      windowSecs: 60,
    });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("returns allowed false when count exceeds limit", async () => {
    mockRpc.mockResolvedValue({ data: 4, error: null });
    const { checkRateLimit } = await import("@/lib/security/rate-limit");
    const result = await checkRateLimit({
      key: "over-limit",
      limit: 3,
      windowSecs: 60,
    });
    expect(result.allowed).toBe(false);
  });

  it("returns resetAt as a Date", async () => {
    mockRpc.mockResolvedValue({ data: 1, error: null });
    const { checkRateLimit } = await import("@/lib/security/rate-limit");
    const result = await checkRateLimit({
      key: "reset-test",
      limit: 10,
      windowSecs: 60,
    });
    expect(result.resetAt).toBeInstanceOf(Date);
  });

  it("denies when RPC unavailable (fail-closed)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "RPC error" } });
    const { checkRateLimit } = await import("@/lib/security/rate-limit");
    const result = await checkRateLimit({
      key: "rpc-fail",
      limit: 10,
      windowSecs: 60,
    });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
