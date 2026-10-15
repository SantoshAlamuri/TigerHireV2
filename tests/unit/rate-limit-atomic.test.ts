import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockGte = vi.fn();
const mockCount = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({
    rpc: mockRpc,
    from: mockFrom,
  })),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe("atomic rate limiter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockRpc.mockReset();
    mockInsert.mockReset();
    mockSelect.mockReset();
    mockEq.mockReset();
    mockGte.mockReset();
    mockCount.mockReset();
  });

  it("allowed when under limit", async () => {
    mockRpc.mockResolvedValue({
      data: 3,
      error: null,
    });

    const { checkRateLimit } = await import("@/lib/security/rate-limit");
    const result = await checkRateLimit({
      key: "test-user",
      limit: 5,
      windowSecs: 60,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(result.resetAt).toBeInstanceOf(Date);
    expect(mockRpc).toHaveBeenCalledWith("check_rate_limit_atomic", {
      p_key: "test-user",
      p_window_start: expect.any(String),
      p_limit: 5,
    });
  });

  it("blocked when over limit", async () => {
    mockRpc.mockResolvedValue({
      data: 6,
      error: null,
    });

    const { checkRateLimit } = await import("@/lib/security/rate-limit");
    const result = await checkRateLimit({
      key: "test-user",
      limit: 5,
      windowSecs: 60,
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(mockRpc).toHaveBeenCalled();
  });

  it("denies (fail-closed) when RPC unavailable", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "function does not exist" },
    });

    const { checkRateLimit } = await import("@/lib/security/rate-limit");
    const result = await checkRateLimit({
      key: "test-user",
      limit: 5,
      windowSecs: 60,
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("denies (fail-closed) when RPC returns error", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "RPC error" },
    });

    const { checkRateLimit } = await import("@/lib/security/rate-limit");
    const result = await checkRateLimit({
      key: "test-user",
      limit: 5,
      windowSecs: 60,
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("calculates resetAt correctly", async () => {
    mockRpc.mockResolvedValue({
      data: 2,
      error: null,
    });

    const { checkRateLimit } = await import("@/lib/security/rate-limit");
    const before = Date.now();
    const result = await checkRateLimit({
      key: "test-user",
      limit: 10,
      windowSecs: 120,
    });
    const after = Date.now();

    expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(before + 120 * 1000);
    expect(result.resetAt.getTime()).toBeLessThanOrEqual(after + 120 * 1000);
  });

  it("handles exact limit boundary", async () => {
    mockRpc.mockResolvedValue({
      data: 5,
      error: null,
    });

    const { checkRateLimit } = await import("@/lib/security/rate-limit");
    const result = await checkRateLimit({
      key: "test-user",
      limit: 5,
      windowSecs: 60,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("denies (fail-closed) when RPC unavailable and data is null", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "RPC unavailable" },
    });

    const { checkRateLimit } = await import("@/lib/security/rate-limit");
    const result = await checkRateLimit({
      key: "test-user",
      limit: 5,
      windowSecs: 60,
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
