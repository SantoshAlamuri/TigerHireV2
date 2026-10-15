import { describe, expect, it } from "vitest";
import {
  DEMO_JOB_ID_PREFIX,
  isCandidateMenuEligibleJob,
  normalizeRoleFunctionKey,
  titleCaseRoleFunction,
} from "@/lib/whatsapp/candidate-menu-jobs";

describe("candidate-menu-jobs", () => {
  it("rejects placeholder and pasted-JD titles", () => {
    expect(
      isCandidateMenuEligibleJob({
        id: "a1b2c3d4-0000-4000-8000-000000000099",
        title: "Job Description",
      }),
    ).toBe(false);
    expect(
      isCandidateMenuEligibleJob({
        id: "a1b2c3d4-0000-4000-8000-000000000099",
        title:
          "QA Engineer at Enate. Location India Remote. We are looking for a senior engineer with 5+ years...",
      }),
    ).toBe(false);
  });

  it("rejects demo fixture UUID prefix", () => {
    expect(
      isCandidateMenuEligibleJob({
        id: `${DEMO_JOB_ID_PREFIX}-0000-4000-8000-000000000001`,
        title: "Software Engineer",
      }),
    ).toBe(false);
  });

  it("accepts normal open-role titles", () => {
    expect(
      isCandidateMenuEligibleJob({
        id: "a1b2c3d4-0000-4000-8000-000000000099",
        title: "Senior QA Engineer",
      }),
    ).toBe(true);
  });

  it("normalizes role_function casing for grouping", () => {
    expect(normalizeRoleFunctionKey("Engineering")).toBe("engineering");
    expect(normalizeRoleFunctionKey("engineering")).toBe("engineering");
    expect(titleCaseRoleFunction("engineering")).toBe("Engineering");
  });
});
