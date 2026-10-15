import { describe, it, expect } from "vitest";
import { inferPlanStageType } from "@/lib/recruitment-plan/infer-stage-type";

describe("inferPlanStageType", () => {
  it("maps Applied to application_review", () => {
    expect(inferPlanStageType({ stageName: "Applied" })).toBe("application_review");
  });

  it("maps phone screen names", () => {
    expect(inferPlanStageType({ stageName: "Phone Screen" })).toBe("phone_screen");
  });

  it("maps technical interview", () => {
    expect(
      inferPlanStageType({ stageName: "Technical Interview", pipelineStageType: "interview" }),
    ).toBe("interview");
  });

  it("maps offer stage type", () => {
    expect(inferPlanStageType({ stageName: "Final", pipelineStageType: "offer" })).toBe("offer");
  });

  it("falls back to custom", () => {
    expect(inferPlanStageType({ stageName: "Culture Chat" })).toBe("custom");
  });
});
