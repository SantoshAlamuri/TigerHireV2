import { describe, it, expect, vi } from "vitest";
import { ZodError } from "zod";
import { handleZodError } from "@/lib/api-helpers";
import { zodErrorHandlerPerfLimits } from "../helpers/ci-perf";

vi.mock("@/lib/observability/correlation", () => ({
  getCorrelationId: () => "test-correlation",
}));

describe("Performance — handleZodError (API boundary)", () => {
  it("formats 500 ZodErrors within budget", () => {
    const issues: ZodError["issues"] = [];
    for (let i = 0; i < 12; i++) {
      issues.push({
        code: "custom",
        path: ["nested", "c"],
        message: `invalid at ${i}`,
      });
    }
    const err = new ZodError(issues);

    for (let w = 0; w < 20; w++) {
      handleZodError(err);
    }

    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      const res = handleZodError(err);
      expect(res.status).toBe(422);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(zodErrorHandlerPerfLimits.batchFormatMs);
  });
});
