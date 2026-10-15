import { describe, it, expect } from "vitest";
import { buildJobAssessmentsHref } from "@/lib/assessments/job-assessments-href";

describe("buildJobAssessmentsHref", () => {
  it("builds job path with optional query params", () => {
    expect(buildJobAssessmentsHref("job-1")).toBe("/recruit/jobs/job-1/assessments");
    expect(
      buildJobAssessmentsHref("job-1", {
        applicationId: "app-1",
        stageId: "stage-1",
      }),
    ).toBe("/recruit/jobs/job-1/assessments?applicationId=app-1&stageId=stage-1");
  });
});
