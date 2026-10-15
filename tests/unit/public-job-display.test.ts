import { describe, it, expect } from "vitest";
import {
  getJdSectionEntries,
  shouldShowHiringRequestSections,
  shouldShowRawJobDescription,
  shouldShowSkillPills,
} from "@/lib/jobs/public-job-display";
import type { JdSectionsView } from "@/types";

describe("public-job-display", () => {
  const structured: JdSectionsView = {
    designation: "Junior Data Analyst",
    aboutCompany: "We are a forward-thinking org.",
    rolesAndResponsibilities: ["Build pipelines"],
    technicalSkills: ["SQL", "Python"],
  };

  it("hides raw description when structured sections exist", () => {
    const entries = getJdSectionEntries(structured);
    expect(shouldShowRawJobDescription("Full duplicate JD text", entries)).toBe(false);
  });

  it("shows raw description when only free-text JD exists", () => {
    expect(shouldShowRawJobDescription("Short role summary", [])).toBe(true);
  });

  it("hides skill pills when structured sections are shown", () => {
    const entries = getJdSectionEntries(structured);
    expect(shouldShowSkillPills(entries)).toBe(false);
    expect(shouldShowSkillPills([])).toBe(true);
  });

  it("hides hiring-request sections when full raw description is shown", () => {
    expect(shouldShowHiringRequestSections(true, [])).toBe(false);
  });

  it("shows hiring-request sections when description is absent and no structured sections", () => {
    expect(shouldShowHiringRequestSections(false, [])).toBe(true);
  });

  it("hides hiring-request sections when structured jd_sections are shown", () => {
    const entries = getJdSectionEntries(structured);
    expect(shouldShowHiringRequestSections(false, entries)).toBe(false);
  });
});
