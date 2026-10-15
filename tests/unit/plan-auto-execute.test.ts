import { afterEach, describe, expect, it, vi } from "vitest";
import { isPlanAutoExecuteEnabled } from "@/lib/recruitment-plan/plan-auto-execute-flags";
import { resolvePlanStageForPipelineStage } from "@/lib/recruitment-plan/resolve-plan-stage-for-pipeline";

describe("plan auto-execute flags", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off when plan document flag is off", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "false");
    vi.stubEnv("FF_PLAN_AUTO_EXECUTE", "true");
    expect(isPlanAutoExecuteEnabled()).toBe(false);
  });

  it("is on only when both flags are true", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "true");
    vi.stubEnv("FF_PLAN_AUTO_EXECUTE", "true");
    expect(isPlanAutoExecuteEnabled()).toBe(true);
  });

  it("is off when auto-execute flag is off", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "true");
    vi.stubEnv("FF_PLAN_AUTO_EXECUTE", "false");
    expect(isPlanAutoExecuteEnabled()).toBe(false);
  });
});

describe("resolvePlanStageForPipelineStage", () => {
  it("exports resolver function", () => {
    expect(typeof resolvePlanStageForPipelineStage).toBe("function");
  });
});
