import { describe, expect, it } from "vitest";
import { planStageTypeToPipelineType } from "@/lib/recruitment-plan/sync-plan-stages-to-pipeline";

describe("syncPlanStagesToPipeline helpers", () => {
  it("maps phone_screen to screening pipeline type", () => {
    expect(planStageTypeToPipelineType("phone_screen")).toBe("screening");
  });

  it("maps interview to interview pipeline type", () => {
    expect(planStageTypeToPipelineType("interview")).toBe("interview");
  });
});
