import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCanSendWhatsApp = vi.fn();
const mockSendReferralUtilityFirstContact = vi.fn();

vi.mock("@/lib/whatsapp/outbound-policy", () => ({
  canSendWhatsApp: (...args: unknown[]) => mockCanSendWhatsApp(...args),
}));

vi.mock("@/lib/whatsapp/templates", () => ({
  sendReferralUtilityFirstContact: (...args: unknown[]) =>
    mockSendReferralUtilityFirstContact(...args),
  sendConsentRequest: vi.fn(),
}));

describe("sendWhatsAppOutbound", () => {
  beforeEach(() => {
    mockCanSendWhatsApp.mockReset();
    mockSendReferralUtilityFirstContact.mockReset();
    mockCanSendWhatsApp.mockResolvedValue({ allowed: true });
    mockSendReferralUtilityFirstContact.mockResolvedValue({
      success: true,
      templateName: "th_application_received",
    });
  });

  it("routes employee_referral_invite through first_contact policy", async () => {
    const { sendWhatsAppOutbound } = await import("@/lib/whatsapp/send-outbound");
    const result = await sendWhatsAppOutbound({
      intent: "employee_referral_invite",
      phone: "919876543210",
      candidateName: "Alex",
      referrerName: "Sam",
    });
    expect(mockCanSendWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "first_contact" }),
    );
    expect(mockSendReferralUtilityFirstContact).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("blocks employee invite when policy denies", async () => {
    mockCanSendWhatsApp.mockResolvedValue({ allowed: false, error: "invalid_phone" });
    const { sendWhatsAppOutbound } = await import("@/lib/whatsapp/send-outbound");
    const result = await sendWhatsAppOutbound({
      intent: "employee_referral_invite",
      phone: "bad",
      candidateName: "Alex",
      referrerName: "Sam",
    });
    expect(result.success).toBe(false);
    expect(mockSendReferralUtilityFirstContact).not.toHaveBeenCalled();
  });
});
