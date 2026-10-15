import { describe, expect, it } from "vitest";
import {
  getWhatsAppTemplateCategory,
  isMarketingWhatsAppTemplate,
} from "@/lib/whatsapp/template-categories";

describe("whatsapp template categories", () => {
  it("classifies known marketing templates", () => {
    expect(getWhatsAppTemplateCategory("tigerhire_referral_v2")).toBe("MARKETING");
    expect(getWhatsAppTemplateCategory("tigerhire_consent_v2")).toBe("MARKETING");
    expect(isMarketingWhatsAppTemplate("th_reengagement")).toBe(true);
  });

  it("classifies utility and authentication templates", () => {
    expect(getWhatsAppTemplateCategory("th_application_received")).toBe("UTILITY");
    expect(getWhatsAppTemplateCategory("tigerhire_referred_candidate_v1")).toBe("UTILITY");
    expect(getWhatsAppTemplateCategory("th_referrer_otp")).toBe("AUTHENTICATION");
    expect(isMarketingWhatsAppTemplate("th_application_received")).toBe(false);
  });
});
