import { describe, it, expect, vi, afterEach } from "vitest";
import { createCircuitBreaker, getCircuitBreaker } from "@/lib/utils/circuit-breaker";

describe("CircuitBreaker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in closed state", () => {
    const cb = createCircuitBreaker({ name: "test-closed" });
    expect(cb.getState()).toBe("closed");
  });

  it("remains closed on successful calls", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 3,
      name: "test-success",
    });
    await cb.run(() => Promise.resolve("ok"));
    await cb.run(() => Promise.resolve("ok"));
    expect(cb.getState()).toBe("closed");
  });

  it("opens after reaching failure threshold", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 3,
      name: "test-threshold",
    });

    for (let i = 0; i < 3; i++) {
      await cb.run(() => Promise.reject(new Error("fail"))).catch(() => {});
    }

    expect(cb.getState()).toBe("open");
  });

  it("rejects immediately when open", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      name: "test-reject",
    });
    await cb.run(() => Promise.reject(new Error("fail"))).catch(() => {});

    expect(cb.getState()).toBe("open");
    await expect(cb.run(() => Promise.resolve("ok"))).rejects.toThrow(
      "CircuitBreaker[test-reject] open",
    );
  });

  it("transitions to half_open after timeout", async () => {
    vi.useFakeTimers();
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      openMs: 1000,
      name: "test-halfopen",
    });

    await cb.run(() => Promise.reject(new Error("fail"))).catch(() => {});
    expect(cb.getState()).toBe("open");

    vi.advanceTimersByTime(1001);
    expect(cb.getState()).toBe("half_open");
  });

  it("closes on successful call in half_open state", async () => {
    vi.useFakeTimers();
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      openMs: 1000,
      name: "test-close-from-halfopen",
    });

    await cb.run(() => Promise.reject(new Error("fail"))).catch(() => {});
    vi.advanceTimersByTime(1001);
    expect(cb.getState()).toBe("half_open");

    await cb.run(() => Promise.resolve("ok"));
    expect(cb.getState()).toBe("closed");
  });

  it("re-opens on failure in half_open state", async () => {
    vi.useFakeTimers();
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      openMs: 1000,
      name: "test-reopen",
    });

    await cb.run(() => Promise.reject(new Error("fail"))).catch(() => {});
    vi.advanceTimersByTime(1001);
    expect(cb.getState()).toBe("half_open");

    await cb.run(() => Promise.reject(new Error("fail again"))).catch(() => {});
    expect(cb.getState()).toBe("open");
  });

  it("resets failure count on success in closed state", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 3,
      name: "test-reset",
    });

    await cb.run(() => Promise.reject(new Error("1"))).catch(() => {});
    await cb.run(() => Promise.reject(new Error("2"))).catch(() => {});
    await cb.run(() => Promise.resolve("ok"));
    await cb.run(() => Promise.reject(new Error("3"))).catch(() => {});
    await cb.run(() => Promise.reject(new Error("4"))).catch(() => {});

    expect(cb.getState()).toBe("closed");
  });
});

describe("getCircuitBreaker", () => {
  it("returns the same instance for the same name", () => {
    const cb1 = getCircuitBreaker("shared");
    const cb2 = getCircuitBreaker("shared");
    expect(cb1).toBe(cb2);
  });

  it("returns different instances for different names", () => {
    const cb1 = getCircuitBreaker("a");
    const cb2 = getCircuitBreaker("b");
    expect(cb1).not.toBe(cb2);
  });
});
