import { describe, expect, it } from "vitest";
import {
  companyOnboardingTelHref,
  formatCompanyOnboardingPhone,
} from "@/lib/company/onboarding-phone";

describe("company onboarding phone", () => {
  it("formats E.164 India numbers for display", () => {
    expect(formatCompanyOnboardingPhone("+917674911055")).toBe("+91 76749 11055");
    expect(formatCompanyOnboardingPhone("7674911055")).toBe("+91 76749 11055");
  });

  it("builds tel links for local 10-digit numbers", () => {
    expect(companyOnboardingTelHref("7674911055")).toBe("tel:+917674911055");
    expect(companyOnboardingTelHref("+917674911055")).toBe("tel:+917674911055");
  });
});
