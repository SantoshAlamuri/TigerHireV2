import { describe, it, expect, vi, afterEach } from "vitest";
import { createCircuitBreaker } from "@/lib/utils/circuit-breaker";
import { circuitBreakerPerfLimits } from "../helpers/ci-perf";

describe("CircuitBreaker — Performance Benchmarks", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("closed-state throughput: > 50,000 ops/sec", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 100,
      name: "perf-closed",
    });
    const iterations = 10_000;

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await cb.run(() => Promise.resolve(i));
    }
    const elapsed = performance.now() - start;

    const opsPerSec = Math.round(iterations / (elapsed / 1000));
    expect(opsPerSec).toBeGreaterThan(circuitBreakerPerfLimits.minThroughputOpsPerSec);
  });

  it("open-state rejection: > 20,000 ops/sec", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, name: "perf-open" });
    await cb.run(() => Promise.reject(new Error("trip"))).catch(() => {});
    expect(cb.getState()).toBe("open");

    const iterations = 10_000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      try {
        await cb.run(() => Promise.resolve("should not run"));
      } catch {
        // expected: circuit is open
      }
    }
    const elapsed = performance.now() - start;

    const opsPerSec = Math.round(iterations / (elapsed / 1000));
    // Rejection path is slower than closed-state and highly sensitive to local CPU contention.
    // Keep a realistic lower bound so this remains a regression guard, not a flaky machine check.
    expect(opsPerSec).toBeGreaterThan(20_000);
  });

  it("state transition overhead is negligible", async () => {
    vi.useFakeTimers();
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      openMs: 1,
      name: "perf-transition",
    });

    const iterations = 1000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      await cb.run(() => Promise.reject(new Error("fail"))).catch(() => {});
      vi.advanceTimersByTime(2);
      await cb.run(() => Promise.resolve("ok"));
    }

    const elapsed = performance.now() - start;
    const avgTransitionMs = elapsed / iterations;
    expect(avgTransitionMs).toBeLessThan(circuitBreakerPerfLimits.maxAvgTransitionMs);
  });

  it("getState() is fast even after many operations", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 100,
      name: "perf-getstate",
    });

    for (let i = 0; i < 1000; i++) {
      await cb.run(() => Promise.resolve("ok"));
    }

    const iterations = 100_000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      cb.getState();
    }
    const elapsed = performance.now() - start;

    const opsPerSec = Math.round(iterations / (elapsed / 1000));
    expect(opsPerSec).toBeGreaterThan(circuitBreakerPerfLimits.minGetStateOpsPerSec);
  });
});
