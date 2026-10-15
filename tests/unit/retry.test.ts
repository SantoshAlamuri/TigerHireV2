import { describe, expect, it, vi } from "vitest";
import { withRetry } from "@/lib/utils/retry";

describe("withRetry", () => {
  it("retries on 429/rate-limit style errors", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 2) throw new Error("429 Too Many Requests; retry-after: 1");
        return "ok";
      },
      { maxRetries: 2, initialMs: 1, maxMs: 5 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("does not retry non-retryable errors", async () => {
    const fn = vi.fn(async () => {
      throw new Error("validation failed");
    });
    await expect(withRetry(fn, { maxRetries: 3, initialMs: 1, maxMs: 5 })).rejects.toThrow(
      "validation failed",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    const result = await withRetry(fn);
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable error and then succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValueOnce("ok");
    const result = await withRetry(fn, {
      maxRetries: 2,
      initialMs: 5,
      maxMs: 20,
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after max retries on retryable error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));
    await expect(withRetry(fn, { maxRetries: 2, initialMs: 5, maxMs: 20 })).rejects.toThrow(
      "ETIMEDOUT",
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry on non-retryable error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Validation failed"));
    await expect(withRetry(fn)).rejects.toThrow("Validation failed");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
