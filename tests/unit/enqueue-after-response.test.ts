import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAfter = vi.fn();
vi.mock("next/server", () => ({
  after: (fn: () => Promise<void>) => mockAfter(fn),
}));

const mockEnqueue = vi.fn();
vi.mock("@/lib/jobs/queue", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/observability/logger", () => ({ logger: mockLogger }));

import { enqueueAfterResponse } from "@/lib/jobs/enqueue-after-response";

describe("enqueueAfterResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueue.mockResolvedValue({ id: "evt-1" });
  });

  it("defers the send to after() so it survives the post-response freeze", () => {
    enqueueAfterResponse("job-distribute", { jobId: "job-1" });

    expect(mockAfter).toHaveBeenCalledTimes(1);
    // Nothing sent yet — that is the point: the response goes out first.
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("sends the job when the deferred callback runs", async () => {
    enqueueAfterResponse("job-distribute", { jobId: "job-1" });
    await mockAfter.mock.calls[0][0]();

    expect(mockEnqueue).toHaveBeenCalledWith("job-distribute", { jobId: "job-1" }, undefined);
  });

  it("logs rather than throwing when the deferred send fails", async () => {
    mockEnqueue.mockRejectedValue(new Error("inngest down"));

    enqueueAfterResponse("fit-score-batch", { jobId: "job-1" });
    await expect(mockAfter.mock.calls[0][0]()).resolves.toBeUndefined();

    expect(mockLogger.error).toHaveBeenCalledWith(
      "enqueue_after_response_failed",
      expect.objectContaining({ name: "fit-score-batch" }),
    );
  });

  it("falls back to a direct send outside a request context, and says so", async () => {
    mockAfter.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });

    expect(() => enqueueAfterResponse("job-remove-from-boards", { jobId: "job-1" })).not.toThrow();

    expect(mockLogger.warn).toHaveBeenCalledWith("enqueue_after_response_no_request_context", {
      name: "job-remove-from-boards",
    });
    await vi.waitFor(() =>
      expect(mockEnqueue).toHaveBeenCalledWith(
        "job-remove-from-boards",
        { jobId: "job-1" },
        undefined,
      ),
    );
  });
});
