import { describe, it, expect, vi, afterEach } from "vitest";
import { createCircuitBreaker } from "@/lib/utils/circuit-breaker";

describe("CircuitBreaker — Stress Tests", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("handles 1000 concurrent successful calls without state corruption", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 5,
      name: "stress-success",
    });
    const results = await Promise.all(
      Array.from({ length: 1000 }, (_, i) => cb.run(() => Promise.resolve(i))),
    );
    expect(results).toHaveLength(1000);
    expect(cb.getState()).toBe("closed");
  });

  it("handles rapid alternating success/failure without deadlocking", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 10,
      name: "stress-alternate",
    });
    const results: Array<"ok" | "err"> = [];

    for (let i = 0; i < 500; i++) {
      try {
        if (i % 3 === 0) {
          await cb.run(() => Promise.reject(new Error(`fail-${i}`)));
        } else {
          await cb.run(() => Promise.resolve("ok"));
        }
        results.push("ok");
      } catch {
        results.push("err");
      }
    }

    expect(results.length).toBe(500);
    const state = cb.getState();
    expect(["closed", "open", "half_open"]).toContain(state);
  });

  it("recovers correctly after opening under heavy failure load", async () => {
    vi.useFakeTimers();
    const cb = createCircuitBreaker({
      failureThreshold: 3,
      openMs: 500,
      name: "stress-recovery",
    });

    for (let i = 0; i < 100; i++) {
      await cb.run(() => Promise.reject(new Error("burst"))).catch(() => {});
    }
    expect(cb.getState()).toBe("open");

    vi.advanceTimersByTime(600);
    expect(cb.getState()).toBe("half_open");

    await cb.run(() => Promise.resolve("ok"));
    expect(cb.getState()).toBe("closed");

    const postRecovery = await Promise.all(
      Array.from({ length: 50 }, () => cb.run(() => Promise.resolve("ok"))),
    );
    expect(postRecovery).toHaveLength(50);
    expect(cb.getState()).toBe("closed");
  });

  it("transitions open→half_open→open repeatedly without state leak", async () => {
    vi.useFakeTimers();
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      openMs: 100,
      name: "stress-toggle",
    });

    for (let cycle = 0; cycle < 50; cycle++) {
      await cb.run(() => Promise.reject(new Error("fail"))).catch(() => {});
      expect(cb.getState()).toBe("open");

      vi.advanceTimersByTime(101);
      expect(cb.getState()).toBe("half_open");

      await cb.run(() => Promise.reject(new Error("still failing"))).catch(() => {});
      expect(cb.getState()).toBe("open");
    }

    vi.advanceTimersByTime(101);
    await cb.run(() => Promise.resolve("recovered"));
    expect(cb.getState()).toBe("closed");
  });

  it("handles concurrent calls when transitioning to open", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 5,
      name: "stress-concurrent-open",
    });
    const errors: Error[] = [];

    const promises = Array.from({ length: 100 }, async () => {
      try {
        await cb.run(async () => {
          await new Promise((r) => setTimeout(r, 1));
          throw new Error("fail");
        });
      } catch (e) {
        errors.push(e as Error);
      }
    });

    await Promise.all(promises);
    expect(errors.length).toBe(100);
    expect(cb.getState()).toBe("open");
  });
});
