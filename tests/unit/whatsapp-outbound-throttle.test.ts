import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/redis/client", () => ({
  getRedis: vi.fn(),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const originalLimit = process.env.WHATSAPP_OUTBOUND_PER_SECOND_LIMIT;

describe("awaitOutboundSlot", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.WHATSAPP_OUTBOUND_PER_SECOND_LIMIT = "3";
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalLimit === undefined) {
      delete process.env.WHATSAPP_OUTBOUND_PER_SECOND_LIMIT;
    } else {
      process.env.WHATSAPP_OUTBOUND_PER_SECOND_LIMIT = originalLimit;
    }
  });

  it("returns immediately when under the per-second limit", async () => {
    const incr = vi.fn().mockResolvedValue(1);
    const expire = vi.fn().mockResolvedValue(1);
    const { getRedis } = await import("@/lib/redis/client");
    (getRedis as ReturnType<typeof vi.fn>).mockReturnValue({ incr, expire });

    const { awaitOutboundSlot } = await import("@/lib/whatsapp/outbound-rate-limit");

    const start = Date.now();
    await awaitOutboundSlot();
    const elapsed = Date.now() - start;

    expect(incr).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledTimes(1);
    expect(elapsed).toBeLessThan(50);
  });

  it("does not call expire on subsequent increments within the same window", async () => {
    const incr = vi.fn().mockResolvedValue(2);
    const expire = vi.fn().mockResolvedValue(1);
    const { getRedis } = await import("@/lib/redis/client");
    (getRedis as ReturnType<typeof vi.fn>).mockReturnValue({ incr, expire });

    const { awaitOutboundSlot } = await import("@/lib/whatsapp/outbound-rate-limit");
    await awaitOutboundSlot();

    expect(incr).toHaveBeenCalledTimes(1);
    expect(expire).not.toHaveBeenCalled();
  });

  it("returns silently when Redis is unavailable (fails open)", async () => {
    const { getRedis } = await import("@/lib/redis/client");
    (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const { awaitOutboundSlot } = await import("@/lib/whatsapp/outbound-rate-limit");
    await expect(awaitOutboundSlot()).resolves.toBeUndefined();
  });

  it("returns silently when Redis throws (fails open)", async () => {
    const incr = vi.fn().mockRejectedValue(new Error("connection refused"));
    const { getRedis } = await import("@/lib/redis/client");
    (getRedis as ReturnType<typeof vi.fn>).mockReturnValue({ incr, expire: vi.fn() });

    const { awaitOutboundSlot } = await import("@/lib/whatsapp/outbound-rate-limit");
    await expect(awaitOutboundSlot()).resolves.toBeUndefined();
  });

  it("waits and retries when current window is saturated, succeeding once limit resets", async () => {
    vi.useFakeTimers();
    // First call: counter=5 (over limit=3) -> wait
    // Second call: counter=1 (next window) -> succeed
    const incr = vi.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(1);
    const expire = vi.fn().mockResolvedValue(1);
    const { getRedis } = await import("@/lib/redis/client");
    (getRedis as ReturnType<typeof vi.fn>).mockReturnValue({ incr, expire });

    const { awaitOutboundSlot } = await import("@/lib/whatsapp/outbound-rate-limit");

    const promise = awaitOutboundSlot();
    // Allow the first incr to resolve.
    await vi.advanceTimersByTimeAsync(0);
    // Now the helper is sleeping until the next second window — advance past it.
    await vi.advanceTimersByTimeAsync(1100);
    await promise;

    expect(incr).toHaveBeenCalledTimes(2);
  });

  it("throws OutboundThrottleError after exceeding the 30s wait cap", async () => {
    vi.useFakeTimers();
    // Always over the limit so we keep looping until the cap.
    const incr = vi.fn().mockResolvedValue(999);
    const expire = vi.fn().mockResolvedValue(1);
    const { getRedis } = await import("@/lib/redis/client");
    (getRedis as ReturnType<typeof vi.fn>).mockReturnValue({ incr, expire });

    const { awaitOutboundSlot, OutboundThrottleError } =
      await import("@/lib/whatsapp/outbound-rate-limit");

    const promise = awaitOutboundSlot();
    // Suppress the unhandled rejection until we assert on it.
    promise.catch(() => {});

    // Advance well past the 30s cap; each iteration sleeps ~1s, so 35s covers it.
    await vi.advanceTimersByTimeAsync(35_000);

    await expect(promise).rejects.toBeInstanceOf(OutboundThrottleError);
  });
});
