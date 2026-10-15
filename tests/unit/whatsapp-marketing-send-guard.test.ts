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

describe("whatsapp marketing-send-guard", () => {
  beforeEach(() => {
    mockHasAllRequiredConsent.mockReset();
    mockHasRecentInboundFromPhone.mockReset();
    mockHasOptedIn.mockReset();
    mockHasRecentInboundFromPhone.mockResolvedValue(false);
    mockHasOptedIn.mockResolvedValue(false);
  });

  it("allows utility templates without consent check", async () => {
    const { guardMarketingWhatsAppTemplate } = await import("@/lib/whatsapp/marketing-send-guard");
    const result = await guardMarketingWhatsAppTemplate("th_application_received", "+919876543210");
    expect(result).toEqual({ allowed: true });
    expect(mockHasAllRequiredConsent).not.toHaveBeenCalled();
  });

  it("blocks marketing templates when consent is missing", async () => {
    mockHasAllRequiredConsent.mockResolvedValue(false);
    const { guardMarketingWhatsAppTemplate } = await import("@/lib/whatsapp/marketing-send-guard");
    const result = await guardMarketingWhatsAppTemplate("tigerhire_referral_v2", "919876543210");
    expect(result).toEqual({
      allowed: false,
      error: "marketing_requires_consent",
      reason: "marketing_requires_consent",
    });
  });

  it("allows marketing templates after consent and session", async () => {
    mockHasAllRequiredConsent.mockResolvedValue(true);
    mockHasOptedIn.mockResolvedValue(true);
    const { guardMarketingWhatsAppTemplate } = await import("@/lib/whatsapp/marketing-send-guard");
    const result = await guardMarketingWhatsAppTemplate("tigerhire_fitscore_v2", "+919876543210");
    expect(result).toEqual({ allowed: true });
  });
});
