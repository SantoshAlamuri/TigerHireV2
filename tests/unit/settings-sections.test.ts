import { describe, expect, it } from "vitest";
import {
  buildCompanyHiringSetupSections,
  buildRecruitHiringSetupSections,
  buildSettingsSections,
} from "@/features/settings/config/sections";

describe("buildSettingsSections", () => {
  it("lists only recruit settings routes that remain under Settings", () => {
    const sections = buildSettingsSections("/recruit/settings");
    const hrefs = sections.map((s) => s.href);
    expect(hrefs).toEqual(["/recruit/settings/integrations"]);
    expect(sections.every((s) => s.id && s.label)).toBe(true);
  });

  it("includes company overview, job boards, and admin settings only (hiring setup is separate nav)", () => {
    const sections = buildSettingsSections("/company/settings");
    const ids = sections.map((s) => s.id);
    expect(ids).toEqual([
      "overview",
      "integrations",
      "job_boards",
      "permissions",
      "privacy",
      "audit",
    ]);
    expect(ids).not.toContain("pipeline");
    expect(ids).not.toContain("offer_approval_workflow");
  });
});

describe("hiring setup sections", () => {
  it("groups recruit pipeline and offer routes for in-page nav", () => {
    const sections = buildRecruitHiringSetupSections();
    expect(sections.map((s) => s.href)).toEqual([
      "/recruit/hiring-requests",
      "/recruit/jobs",
      "/recruit/jobs",
      "/company/settings/pipeline",
      "/company/settings/screening",
      "/company/settings/templates",
      "/company/settings/compensation-bands",
      "/company/settings/offer-approval-workflow",
    ]);
  });

  it("groups company pipeline and offer routes for in-page nav", () => {
    const sections = buildCompanyHiringSetupSections();
    expect(sections.map((s) => s.href)).toEqual([
      "/company/hiring-requests",
      "/company/jobs",
      "/company/jobs",
      "/company/settings/pipeline",
      "/company/settings/screening",
      "/company/settings/templates",
      "/company/settings/compensation-bands",
      "/company/settings/offer-approval-workflow",
    ]);
  });
});
