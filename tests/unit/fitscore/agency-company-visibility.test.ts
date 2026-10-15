import { describe, expect, it } from "vitest";
import {
  isAgencyStageVisibleToCompany,
  isAgencyUploadedApplicationSource,
} from "@/lib/constants/agency-stages";

describe("agency company visibility", () => {
  it("treats agency_upload as agency-sourced", () => {
    expect(isAgencyUploadedApplicationSource("agency_upload")).toBe(true);
    expect(isAgencyUploadedApplicationSource("direct")).toBe(false);
  });

  it("hides interest_received from company", () => {
    expect(isAgencyStageVisibleToCompany("interest_received")).toBe(false);
    expect(isAgencyStageVisibleToCompany(null)).toBe(false);
  });

  it("shows shared_with_company and later stages to company", () => {
    expect(isAgencyStageVisibleToCompany("shared_with_company")).toBe(true);
    expect(isAgencyStageVisibleToCompany("shortlisted")).toBe(true);
    expect(isAgencyStageVisibleToCompany("joined")).toBe(true);
  });
});
