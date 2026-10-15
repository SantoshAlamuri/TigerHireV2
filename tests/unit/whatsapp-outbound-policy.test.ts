import { beforeEach, describe, expect, it, vi } from "vitest";

const mockHasAllRequiredConsent = vi.fn();
const mockHasRecentInboundFromPhone = vi.fn();
const mockHasOptedIn = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({}),
}));

vi.mock("@/lib/repositories/ConsentRepository", () => ({
  ConsentRepository: {
    hasAllRequiredConsent: (...args: unknown[]) => mockHasAllRequiredConsent(...args),
  },
}));

vi.mock("@/lib/repositories/SessionRepository", () => ({
  SessionRepository: {
    hasOptedIn: (...args: unknown[]) => mockHasOptedIn(...args),
  },
}));

vi.mock("@/lib/whatsapp/message-log", () => ({
  hasRecentInboundFromPhone: (...args: unknown[]) => mockHasRecentInboundFromPhone(...args),
}));

const mockIsPhoneOptedOut = vi.fn();
vi.mock("@/lib/whatsapp/opt-out", () => ({
  isPhoneOptedOut: (...args: unknown[]) => mockIsPhoneOptedOut(...args),
}));

describe("whatsapp outbound policy", () => {
  beforeEach(() => {
    mockHasAllRequiredConsent.mockReset();
    mockHasRecentInboundFromPhone.mockReset();
    mockHasOptedIn.mockReset();
    mockHasRecentInboundFromPhone.mockResolvedValue(false);
    mockHasOptedIn.mockResolvedValue(false);
    mockHasAllRequiredConsent.mockResolvedValue(false);
    mockIsPhoneOptedOut.mockReset();
    mockIsPhoneOptedOut.mockResolvedValue(false);
  });

  it("allows authentication purpose and OTP templates without consent", async () => {
    const { canSendWhatsApp } = await import("@/lib/whatsapp/outbound-policy");

    await expect(
      canSendWhatsApp({ phone: "+919876543210", purpose: "authentication" }),
    ).resolves.toEqual({ allowed: true, channel: "template" });

    await expect(
      canSendWhatsApp({
        phone: "919876543210",
        purpose: "transactional",
        templateName: "th_referrer_otp",
      }),
    ).resolves.toEqual({ allowed: true, channel: "template" });

    expect(mockHasAllRequiredConsent).not.toHaveBeenCalled();
  });

  it("allows utility templates on cold numbers for transactional purposes", async () => {
    const { canSendWhatsApp } = await import("@/lib/whatsapp/outbound-policy");

    const result = await canSendWhatsApp({
      phone: "+919876543210",
      purpose: "transactional",
      templateName: "th_application_received",
    });

    expect(result).toEqual({ allowed: true, channel: "template" });
    expect(mockHasAllRequiredConsent).not.toHaveBeenCalled();
    expect(mockHasRecentInboundFromPhone).not.toHaveBeenCalled();
  });

  it("blocks marketing templates on cold numbers without consent", async () => {
    const { canSendWhatsApp } = await import("@/lib/whatsapp/outbound-policy");

    const result = await canSendWhatsApp({
      phone: "919876543210",
      purpose: "transactional",
      templateName: "tigerhire_referral_v2",
    });

    expect(result).toEqual({
      allowed: false,
      error: "marketing_requires_consent",
      reason: "marketing_requires_consent",
    });
  });

  it("blocks marketing purpose when consent is missing", async () => {
    const { canSendWhatsApp } = await import("@/lib/whatsapp/outbound-policy");

    const result = await canSendWhatsApp({
      phone: "919876543210",
      purpose: "marketing",
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("marketing_requires_consent");
  });

  it("blocks marketing when consent exists but no session window", async () => {
    mockHasAllRequiredConsent.mockResolvedValue(true);

    const { canSendWhatsApp } = await import("@/lib/whatsapp/outbound-policy");

    const result = await canSendWhatsApp({
      phone: "919876543210",
      purpose: "marketing",
      templateName: "th_reengagement",
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("marketing_requires_session");
  });

  it("allows marketing when consent and recent inbound exist", async () => {
    mockHasAllRequiredConsent.mockResolvedValue(true);
    mockHasRecentInboundFromPhone.mockResolvedValue(true);

    const { canSendWhatsApp } = await import("@/lib/whatsapp/outbound-policy");

    const result = await canSendWhatsApp({
      phone: "919876543210",
      purpose: "marketing",
      templateName: "tigerhire_fitscore_v2",
    });

    expect(result).toEqual({ allowed: true, channel: "template" });
  });

  it("allows marketing when consent and session opt-in exist", async () => {
    mockHasAllRequiredConsent.mockResolvedValue(true);
    mockHasOptedIn.mockResolvedValue(true);

    const { canSendWhatsApp } = await import("@/lib/whatsapp/outbound-policy");

    const result = await canSendWhatsApp({
      phone: "919876543210",
      purpose: "marketing",
    });

    expect(result).toEqual({ allowed: true, channel: "template" });
  });

  it("blocks session_text without inbound or opt-in", async () => {
    const { canSendWhatsApp } = await import("@/lib/whatsapp/outbound-policy");

    const result = await canSendWhatsApp({
      phone: "919876543210",
      purpose: "session_text",
    });

    expect(result).toEqual({
      allowed: false,
      error: "session_window_closed",
      reason: "session_window_closed",
    });
  });

  it("allows session_text with recent inbound", async () => {
    mockHasRecentInboundFromPhone.mockResolvedValue(true);

    const { canSendWhatsApp } = await import("@/lib/whatsapp/outbound-policy");

    const result = await canSendWhatsApp({
      phone: "919876543210",
      purpose: "session_text",
    });

    expect(result).toEqual({ allowed: true, channel: "session" });
  });

  it("blocks session_text to an opted-out phone even with an open window", async () => {
    mockIsPhoneOptedOut.mockResolvedValue(true);
    mockHasRecentInboundFromPhone.mockResolvedValue(true);

    const { canSendWhatsApp } = await import("@/lib/whatsapp/outbound-policy");

    const result = await canSendWhatsApp({
      phone: "919876543210",
      purpose: "session_text",
    });

    expect(result).toEqual({
      allowed: false,
      error: "recipient_opted_out",
      reason: "recipient_opted_out",
    });
  });

  it("blocks utility/transactional templates to an opted-out phone", async () => {
    mockIsPhoneOptedOut.mockResolvedValue(true);

    const { canSendWhatsApp } = await import("@/lib/whatsapp/outbound-policy");

    const result = await canSendWhatsApp({
      phone: "919876543210",
      purpose: "transactional",
      templateName: "th_shortlisted",
    });

    expect(result).toEqual({
      allowed: false,
      error: "recipient_opted_out",
      reason: "recipient_opted_out",
    });
  });

  it("blocks marketing to an opted-out phone even with consent + session", async () => {
    mockIsPhoneOptedOut.mockResolvedValue(true);
    mockHasAllRequiredConsent.mockResolvedValue(true);
    mockHasRecentInboundFromPhone.mockResolvedValue(true);

    const { canSendWhatsApp } = await import("@/lib/whatsapp/outbound-policy");

    const result = await canSendWhatsApp({
      phone: "919876543210",
      purpose: "marketing",
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("recipient_opted_out");
  });

  it("allowOptedOut bypasses the gate for the STOP confirmation only", async () => {
    mockIsPhoneOptedOut.mockResolvedValue(true);
    mockHasRecentInboundFromPhone.mockResolvedValue(true); // they just texted STOP

    const { canSendWhatsApp } = await import("@/lib/whatsapp/outbound-policy");

    const result = await canSendWhatsApp({
      phone: "919876543210",
      purpose: "session_text",
      allowOptedOut: true,
    });

    expect(result).toEqual({ allowed: true, channel: "session" });
    expect(mockIsPhoneOptedOut).not.toHaveBeenCalled();
  });

  it("still allows user-initiated authentication OTPs to an opted-out phone", async () => {
    mockIsPhoneOptedOut.mockResolvedValue(true);

    const { canSendWhatsApp } = await import("@/lib/whatsapp/outbound-policy");

    await expect(
      canSendWhatsApp({ phone: "919876543210", purpose: "authentication" }),
    ).resolves.toEqual({ allowed: true, channel: "template" });
    expect(mockIsPhoneOptedOut).not.toHaveBeenCalled();
  });

  it("rejects invalid phone numbers", async () => {
    const { canSendWhatsApp } = await import("@/lib/whatsapp/outbound-policy");

    const result = await canSendWhatsApp({
      phone: "12345",
      purpose: "transactional",
    });

    expect(result).toEqual({
      allowed: false,
      error: "invalid_phone",
      reason: "invalid_phone",
    });
  });
});
