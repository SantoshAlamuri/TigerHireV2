import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSendTemplateWithFallback = vi.fn();

vi.mock("@/lib/whatsapp/template-send-fallback", () => ({
  sendTemplateWithFallback: (...args: unknown[]) => mockSendTemplateWithFallback(...args),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendTemplateMessage: vi.fn(),
}));

type FallbackArg = { templateNames: string[]; bodyParams: string[] };

describe("sendReferralUtilityFirstContact (Bug Report: Job Referral #1/#3)", () => {
  const savedTemplateEnv = process.env.WHATSAPP_REFERRAL_INVITE_TEMPLATE;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockSendTemplateWithFallback.mockResolvedValue({ success: true, templateName: "t" });
    delete process.env.WHATSAPP_REFERRAL_INVITE_TEMPLATE;
  });

  afterEach(() => {
    if (savedTemplateEnv === undefined) delete process.env.WHATSAPP_REFERRAL_INVITE_TEMPLATE;
    else process.env.WHATSAPP_REFERRAL_INVITE_TEMPLATE = savedTemplateEnv;
  });

  it("falls back to the legacy params when no job context is supplied", async () => {
    const { sendReferralUtilityFirstContact } = await import("@/lib/whatsapp/templates");
    await sendReferralUtilityFirstContact("+919000000000", "Rahul", "Meera Nair");
    const arg = mockSendTemplateWithFallback.mock.calls[0][0] as FallbackArg;
    expect(arg.templateNames).toEqual(["th_application_received"]);
    expect(arg.bodyParams).toEqual(["Rahul", "an open role (referred by Meera)", "TigerHire"]);
  });

  it("uses the real company name and job title when job context is supplied", async () => {
    const { sendReferralUtilityFirstContact } = await import("@/lib/whatsapp/templates");
    await sendReferralUtilityFirstContact("+919000000000", "Rahul", "Meera Nair", {
      jobTitle: "Senior Data Analyst",
      companyName: "Finstack",
      applyUrl: "https://tigerhire.io/apply/finstack?job=abc",
    });
    const arg = mockSendTemplateWithFallback.mock.calls[0][0] as FallbackArg;
    expect(arg.templateNames).toEqual(["th_application_received"]);
    expect(arg.bodyParams).toEqual([
      "Rahul",
      "the Senior Data Analyst role (referred by Meera)",
      "Finstack",
    ]);
    // Critically: no longer says "TigerHire".
    expect(arg.bodyParams).not.toContain("TigerHire");
  });

  it("sends the link-bearing invite template first when WHATSAPP_REFERRAL_INVITE_TEMPLATE is set", async () => {
    process.env.WHATSAPP_REFERRAL_INVITE_TEMPLATE = "th_referral_invite_v1";
    const { sendReferralUtilityFirstContact } = await import("@/lib/whatsapp/templates");
    await sendReferralUtilityFirstContact("+919000000000", "Rahul", "Meera Nair", {
      jobTitle: "Senior Data Analyst",
      companyName: "Finstack",
      applyUrl: "https://tigerhire.io/apply/finstack?job=abc",
    });
    const arg = mockSendTemplateWithFallback.mock.calls[0][0] as FallbackArg;
    expect(arg.templateNames).toEqual(["th_referral_invite_v1"]);
    expect(arg.bodyParams).toEqual([
      "Rahul",
      "Meera",
      "Senior Data Analyst",
      "Finstack",
      "https://tigerhire.io/apply/finstack?job=abc",
    ]);
  });
});
