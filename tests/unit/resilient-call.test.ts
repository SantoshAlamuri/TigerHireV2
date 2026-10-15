import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/utils/circuit-breaker", () => ({
  getCircuitBreaker: vi.fn(),
}));

vi.mock("@/lib/utils/retry", () => ({
  withRetry: vi.fn(),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe("resilient-call utility", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("successful calls return the result", async () => {
    const { getCircuitBreaker } = await import("@/lib/utils/circuit-breaker");
    const { withRetry } = await import("@/lib/utils/retry");

    const mockRun = vi.fn().mockResolvedValue("success");
    const mockBreaker = { run: mockRun };
    vi.mocked(getCircuitBreaker).mockReturnValue(mockBreaker as any);
    vi.mocked(withRetry).mockImplementation(async (fn) => fn());

    const { createResilientCall } = await import("@/lib/utils/resilient-call");
    const resilientCall = createResilientCall({ service: "test-service" });

    const result = await resilientCall(async () => "success");
    expect(result).toBe("success");
    expect(mockRun).toHaveBeenCalled();
  });

  it("failed calls trigger retry", async () => {
    const { getCircuitBreaker } = await import("@/lib/utils/circuit-breaker");
    const { withRetry } = await import("@/lib/utils/retry");

    const mockRun = vi.fn().mockRejectedValue(new Error("network error"));
    const mockBreaker = { run: mockRun };
    vi.mocked(getCircuitBreaker).mockReturnValue(mockBreaker as any);

    let attemptCount = 0;
    vi.mocked(withRetry).mockImplementation(async (fn) => {
      attemptCount++;
      if (attemptCount < 2) {
        throw new Error("network error");
      }
      return fn();
    });

    const { createResilientCall } = await import("@/lib/utils/resilient-call");
    const resilientCall = createResilientCall({
      service: "test-service",
      maxRetries: 2,
    });

    await expect(
      resilientCall(async () => {
        throw new Error("network error");
      }),
    ).rejects.toThrow("network error");
    expect(mockRun).toHaveBeenCalled();
  });

  it("circuit opens after threshold failures", async () => {
    const { getCircuitBreaker } = await import("@/lib/utils/circuit-breaker");
    const { withRetry } = await import("@/lib/utils/retry");

    const mockBreaker = {
      run: vi.fn(),
      getState: vi.fn(),
    };
    vi.mocked(getCircuitBreaker).mockReturnValue(mockBreaker as any);
    vi.mocked(withRetry).mockImplementation(async (fn) => fn());

    // Simulate circuit breaker opening after failures
    let failureCount = 0;
    mockBreaker.run.mockImplementation(async (fn) => {
      failureCount++;
      if (failureCount >= 5) {
        mockBreaker.getState.mockReturnValue("open");
        throw new Error("CircuitBreaker[test-service] open");
      }
      throw new Error("service error");
    });

    const { createResilientCall } = await import("@/lib/utils/resilient-call");
    const resilientCall = createResilientCall({
      service: "test-service",
      failureThreshold: 5,
    });

    // First 4 failures should go through
    for (let i = 0; i < 4; i++) {
      await expect(
        resilientCall(async () => {
          throw new Error("service error");
        }),
      ).rejects.toThrow("service error");
    }

    // 5th failure should open circuit
    await expect(
      resilientCall(async () => {
        throw new Error("service error");
      }),
    ).rejects.toThrow("CircuitBreaker[test-service] open");
  });

  it("circuit rejects while open", async () => {
    const { getCircuitBreaker } = await import("@/lib/utils/circuit-breaker");
    const { withRetry } = await import("@/lib/utils/retry");

    const mockBreaker = {
      run: vi.fn().mockRejectedValue(new Error("CircuitBreaker[test-service] open")),
      getState: vi.fn().mockReturnValue("open"),
    };
    vi.mocked(getCircuitBreaker).mockReturnValue(mockBreaker as any);
    vi.mocked(withRetry).mockImplementation(async (fn) => fn());

    const { createResilientCall } = await import("@/lib/utils/resilient-call");
    const resilientCall = createResilientCall({ service: "test-service" });

    await expect(resilientCall(async () => "should not execute")).rejects.toThrow(
      "CircuitBreaker[test-service] open",
    );
    expect(mockBreaker.run).toHaveBeenCalled();
  });

  it("timeout aborts the call", async () => {
    const { getCircuitBreaker } = await import("@/lib/utils/circuit-breaker");
    const { withRetry } = await import("@/lib/utils/retry");

    vi.useFakeTimers();

    const mockRun = vi.fn().mockImplementation(async (fn) => {
      return fn();
    });
    const mockBreaker = { run: mockRun };
    vi.mocked(getCircuitBreaker).mockReturnValue(mockBreaker as any);

    let abortSignalFired = false;
    vi.mocked(withRetry).mockImplementation(async (fn) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
        abortSignalFired = true;
      }, 100);
      try {
        return await fn();
      } finally {
        clearTimeout(timer);
      }
    });

    const { createResilientCall } = await import("@/lib/utils/resilient-call");
    const resilientCall = createResilientCall({
      service: "test-service",
      timeoutMs: 100,
    });

    const promise = resilientCall(async (signal) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (signal.aborted) {
        throw new Error("Aborted");
      }
      return "success";
    });
    promise.catch(() => {}); // avoid unhandled rejection when timers fire

    await vi.advanceTimersByTimeAsync(200);

    try {
      await expect(promise).rejects.toThrow();
    } finally {
      vi.useRealTimers();
    }
    expect(abortSignalFired).toBe(true);
  });

  it("handles successful call after retries", async () => {
    const { getCircuitBreaker } = await import("@/lib/utils/circuit-breaker");
    const { withRetry } = await import("@/lib/utils/retry");

    const mockRun = vi.fn().mockResolvedValue("success after retry");
    const mockBreaker = { run: mockRun };
    vi.mocked(getCircuitBreaker).mockReturnValue(mockBreaker as any);

    let retryCount = 0;
    vi.mocked(withRetry).mockImplementation(async (fn) => {
      retryCount++;
      if (retryCount === 1) {
        throw new Error("network error");
      }
      return fn();
    });

    const { createResilientCall } = await import("@/lib/utils/resilient-call");
    const resilientCall = createResilientCall({
      service: "test-service",
      maxRetries: 2,
    });

    const result = await resilientCall(async () => "success after retry");
    expect(result).toBe("success after retry");
    expect(mockRun).toHaveBeenCalled();
  });
});
