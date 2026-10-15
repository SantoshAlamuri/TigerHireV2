import { describe, it, expect, vi, afterEach } from "vitest";
import { withRetry } from "@/lib/utils/retry";

describe("withRetry — Stress Tests", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("handles 50 concurrent retry operations", async () => {
    let attempt = 0;
    const fn = async () => {
      attempt++;
      if (attempt % 2 === 1) throw new Error("503 Service Unavailable");
      return "ok";
    };

    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () =>
        withRetry(() => fn(), { maxRetries: 2, initialMs: 1, maxMs: 10 }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    expect(fulfilled).toBeGreaterThan(0);
  });

  it("does not retry non-retryable errors even under load", async () => {
    const callCounts: number[] = [];
    const promises = Array.from({ length: 20 }, async (_, i) => {
      let calls = 0;
      try {
        await withRetry(
          () => {
            calls++;
            throw new Error("ValidationError: bad input");
          },
          { maxRetries: 3, initialMs: 1 },
        );
      } catch {
        // expected
      }
      callCounts.push(calls);
    });

    await Promise.all(promises);

    for (const c of callCounts) {
      expect(c).toBe(1);
    }
  });

  it("retries transient errors correctly under load", async () => {
    const callCounts: number[] = [];

    const promises = Array.from({ length: 20 }, async () => {
      let calls = 0;
      const result = await withRetry(
        () => {
          calls++;
          if (calls < 3) throw new Error("ECONNRESET");
          return Promise.resolve("recovered");
        },
        { maxRetries: 5, initialMs: 1, maxMs: 5 },
      );
      callCounts.push(calls);
      return result;
    });

    const results = await Promise.all(promises);
    expect(results.every((r) => r === "recovered")).toBe(true);
    for (const c of callCounts) {
      expect(c).toBe(3);
    }
  });

  it("exhausts retries and throws under sustained failures", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 30 }, () =>
        withRetry(() => Promise.reject(new Error("ETIMEDOUT")), {
          maxRetries: 2,
          initialMs: 1,
          maxMs: 5,
        }),
      ),
    );

    for (const r of results) {
      expect(r.status).toBe("rejected");
      if (r.status === "rejected") {
        expect((r.reason as Error).message).toBe("ETIMEDOUT");
      }
    }
  });
});
