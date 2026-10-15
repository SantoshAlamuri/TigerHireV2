import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStartSpan = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  startSpan: (...args: unknown[]) => mockStartSpan(...args),
}));

describe("withRouteSpan", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("SENTRY_DSN", "https://examplePublicKey@o0.ingest.sentry.io/0");
    mockStartSpan.mockImplementation(async (_opts: { name: string }, fn: () => Promise<unknown>) =>
      fn(),
    );
  });

  it("calls Sentry.startSpan with route name and runs handler", async () => {
    const { withRouteSpan } = await import("@/lib/observability/route-span");
    const result = await withRouteSpan("GET /api/health", async () => "ok");
    expect(result).toBe("ok");
    expect(mockStartSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "GET /api/health",
        op: "http.server",
        attributes: { "http.route": "GET /api/health" },
      }),
      expect.any(Function),
    );
  });

  it("returns handler result", async () => {
    const { withRouteSpan } = await import("@/lib/observability/route-span");
    const data = { foo: 42 };
    const result = await withRouteSpan("POST /api/test", async () => data);
    expect(result).toEqual(data);
  });

  it("propagates handler rejection", async () => {
    const { withRouteSpan } = await import("@/lib/observability/route-span");
    await expect(
      withRouteSpan("GET /api/fail", async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");
  });
});
