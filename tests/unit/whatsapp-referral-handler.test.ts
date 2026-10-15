import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  }),
}));

const mockSendWhatsAppMessage = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/services/whatsapp", () => ({
  sendWhatsAppMessage: (...args: unknown[]) => mockSendWhatsAppMessage(...args),
}));

const mockSendReferralInvite = vi.fn().mockResolvedValue({ success: true });
const mockSendWhatsAppOutbound = vi.fn().mockResolvedValue({
  success: true,
  templateName: "th_application_received",
});
vi.mock("@/lib/whatsapp/templates", () => ({
  sendReferralInvite: (...args: unknown[]) => mockSendReferralInvite(...args),
}));
vi.mock("@/lib/whatsapp/send-outbound", () => ({
  sendWhatsAppOutbound: (...args: unknown[]) => mockSendWhatsAppOutbound(...args),
  referralUtilityTemplateIncludesConsent: (name?: string) =>
    name === "tigerhire_referred_candidate_v1",
}));
vi.mock("@/lib/whatsapp/sync-session-consent", () => ({
  prepareSessionAfterEmployeeReferral: vi.fn().mockResolvedValue("awaiting_consent"),
  syncSessionWithConsent: vi.fn().mockResolvedValue({ advanced: false }),
}));

const mockUpdateSession = vi.fn().mockResolvedValue(undefined);
const mockGetOrCreateSession = vi.fn().mockResolvedValue({
  context: { existing: "value" },
});
vi.mock("@/lib/whatsapp/sessions", () => ({
  updateSession: (...args: unknown[]) => mockUpdateSession(...args),
  getOrCreateSession: (...args: unknown[]) => mockGetOrCreateSession(...args),
  withSessionCAS: vi.fn(async (phone: string, mutate: (s: unknown) => unknown) => {
    const session = await mockGetOrCreateSession(phone);
    const outcome = await mutate(session ?? { version: 0, context: {} });
    if (!outcome) return null;
    const o = outcome as { state: string; context: Record<string, unknown>; extras?: unknown };
    if (o.extras === undefined) await mockUpdateSession(phone, o.state, o.context);
    else await mockUpdateSession(phone, o.state, o.context, o.extras);
    return {
      ...((session ?? {}) as Record<string, unknown>),
      session_state: o.state,
      context: o.context,
    };
  }),
  SessionConflictError: class SessionConflictError extends Error {},
}));

const mockCaptureConsentViaWhatsApp = vi.fn().mockResolvedValue({
  alreadyConsented: false,
  sent: true,
  via: "template",
});
vi.mock("@/lib/agents/consent", () => ({
  captureConsentViaWhatsApp: (...args: unknown[]) => mockCaptureConsentViaWhatsApp(...args),
}));

const mockIsEnabled = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/feature-flags", () => ({
  isEnabled: (...args: unknown[]) => mockIsEnabled(...args),
}));

const mockCheckRateLimit = vi.fn().mockResolvedValue({ allowed: true });
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("@/lib/config/env", () => ({
  env: {
    referralDailyCap: 20,
    referralTargetDedupWindowHours: 24,
  },
}));

const mockHasRecentInboundFromPhone = vi.fn().mockResolvedValue(false);
vi.mock("@/lib/whatsapp/message-log", () => ({
  hasRecentInboundFromPhone: (...args: unknown[]) => mockHasRecentInboundFromPhone(...args),
}));

const mockLoggerInfo = vi.fn();
vi.mock("@/lib/observability/logger", () => ({
  logger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function chainable(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue(builder);
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.update = vi.fn().mockReturnValue(builder);
  builder.gte = vi.fn().mockReturnValue(builder);
  builder.neq = vi.fn().mockReturnValue(builder);
  builder.is = vi.fn().mockReturnValue(builder);
  builder.single = vi.fn().mockResolvedValue(result);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  return builder;
}

describe("whatsapp referral-handler", () => {
  beforeEach(() => {
    mockAdminFrom.mockReset();
    mockSendWhatsAppMessage.mockReset();
    mockUpdateSession.mockReset();
    mockGetOrCreateSession.mockReset();
    mockCaptureConsentViaWhatsApp.mockReset();
    mockSendReferralInvite.mockReset();
    mockSendWhatsAppOutbound.mockReset();
    mockIsEnabled.mockReset();
    mockCheckRateLimit.mockReset();
    mockHasRecentInboundFromPhone.mockReset();
    mockLoggerInfo.mockReset();
    mockHasRecentInboundFromPhone.mockResolvedValue(false);
    mockSendReferralInvite.mockResolvedValue({ success: true });
    mockSendWhatsAppOutbound.mockResolvedValue({
      success: true,
      templateName: "th_application_received",
    });

    mockGetOrCreateSession.mockResolvedValue({ context: { existing: "value" } });
    mockCaptureConsentViaWhatsApp.mockResolvedValue({
      alreadyConsented: false,
      sent: true,
      via: "template",
    });
    mockIsEnabled.mockResolvedValue(true);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it("creates referrer identity and stores direct referrer id in session context", async () => {
    const profilesBuilder = chainable({
      data: { id: "user-1", full_name: "Referrer One", role: "employee" },
      error: null,
    });
    const referralsBuilder = chainable({
      data: { id: "referral-1" },
      error: null,
    });

    const referrersBuilder = chainable({ data: null, error: null }) as Record<string, unknown>;
    (referrersBuilder.maybeSingle as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: null, error: null }) // user_id lookup
      .mockResolvedValueOnce({ data: null, error: null }); // phone lookup
    (referrersBuilder.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "referrer-1", parent_referrer_id: null },
      error: null,
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profilesBuilder;
      if (table === "referrers") return referrersBuilder;
      if (table === "referrals") return referralsBuilder;
      throw new Error(`unexpected table ${table}`);
    });

    const { detectAndHandleReferral } = await import("@/lib/whatsapp/referral-handler");
    const result = await detectAndHandleReferral(
      "+91 99999 11111",
      "Refer Alice - Backend Engineer - Bangalore",
      "text",
    );

    expect(result).toEqual({ handled: true });
    expect(referrersBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        whatsapp_number: "919999911111",
        type: "employee",
      }),
    );
    expect(mockUpdateSession).toHaveBeenCalledWith(
      "+91 99999 11111",
      "referral_phone_requested",
      expect.objectContaining({
        referral_id: "referral-1",
        referrer_id: "user-1",
        referrer_referrers_id: "referrer-1",
      }),
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "metric.whatsapp_referrer_resolved",
      expect.objectContaining({
        phone: "919999911111",
        direct_referrer_id: "referrer-1",
      }),
    );
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "whatsapp-referral-daily:referrer-1",
      }),
    );
  });

  it("blocks referral creation when daily cap is exceeded and emits bounded metric shape", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });
    const profilesBuilder = chainable({
      data: { id: "user-1", full_name: "Referrer One", role: "employee" },
      error: null,
    });
    const referrersBuilder = chainable({ data: null, error: null }) as Record<string, unknown>;
    (referrersBuilder.maybeSingle as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    (referrersBuilder.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "referrer-1", parent_referrer_id: null },
      error: null,
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profilesBuilder;
      if (table === "referrers") return referrersBuilder;
      if (table === "referrals") return chainable({ data: null, error: null });
      throw new Error(`unexpected table ${table}`);
    });

    const { detectAndHandleReferral } = await import("@/lib/whatsapp/referral-handler");
    const result = await detectAndHandleReferral(
      "+91 99999 11111",
      "Refer Alice - Backend Engineer - Bangalore",
      "text",
    );

    expect(result).toEqual({ handled: true });
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "+91 99999 11111",
      "You've reached today's referral limit. Please try again tomorrow.",
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "metric.referral_rate_limited",
      expect.objectContaining({
        reason: "daily_cap_exceeded",
        referrer_identity_kind: "referrers_id",
        referrer_identity_key: "referrer-1",
        referrer_phone_hash: expect.any(String),
        candidate_phone_hash: null,
      }),
    );
  });

  it("routes referred candidate through consent flow and keeps refer-again state", async () => {
    const referralsBuilder = chainable({
      data: { id: "referral-1" },
      error: null,
    }) as Record<string, unknown>;
    (referralsBuilder.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "referral-1", referrer_id: "user-1" },
      error: null,
    });
    (referralsBuilder.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: null,
    });

    const profilesBuilder = chainable({
      data: { organisation_id: "org-1" },
      error: null,
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "referrals") return referralsBuilder;
      if (table === "profiles") return profilesBuilder;
      throw new Error(`unexpected table ${table}`);
    });

    const { handleReferralCandidatePhone } = await import("@/lib/whatsapp/referral-handler");
    await handleReferralCandidatePhone("919888877777", "+91 90000 00000", {
      referral_id: "referral-1",
      candidate_name: "Alice",
      referrer_name: "Referrer One",
      referrer_id: "user-1",
      referrer_referrers_id: "referrer-1",
      parent_referrer_id: "ref-parent-1",
    });

    expect(mockCaptureConsentViaWhatsApp).not.toHaveBeenCalled();
    expect(mockUpdateSession).toHaveBeenCalledWith(
      "919000000000",
      "new",
      expect.objectContaining({
        referred_by: "user-1",
        referral_id: "referral-1",
        direct_referrer_id: "referrer-1",
        parent_referrer_id: "ref-parent-1",
      }),
    );
    expect(mockUpdateSession).toHaveBeenCalledWith(
      "919888877777",
      "referral_complete",
      expect.objectContaining({
        referral_id: "referral-1",
      }),
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "metric.whatsapp_referred_candidate_consent_routed",
      expect.objectContaining({
        phone: "919000000000",
        referral_id: "referral-1",
      }),
    );
  });

  it("blocks self-referrals without advancing session and logs metric", async () => {
    const referralsBuilder = chainable({
      data: { id: "referral-1", referrer_id: "user-1" },
      error: null,
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "referrals") return referralsBuilder;
      throw new Error(`unexpected table ${table}`);
    });

    const { handleReferralCandidatePhone } = await import("@/lib/whatsapp/referral-handler");
    await handleReferralCandidatePhone("919888877777", "919888877777", {
      referral_id: "referral-1",
      candidate_name: "Alice",
      referrer_name: "Referrer One",
      referrer_id: "user-1",
      referrer_referrers_id: "referrer-1",
    });

    expect(mockCaptureConsentViaWhatsApp).not.toHaveBeenCalled();
    expect(mockUpdateSession).not.toHaveBeenCalledWith(
      "919888877777",
      "referral_complete",
      expect.anything(),
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "metric.referral_rate_limited",
      expect.objectContaining({
        reason: "self_referral_blocked",
        referrer_identity_kind: "referrers_id",
        candidate_phone_hash: expect.any(String),
      }),
    );
  });

  it("resends outreach for duplicate target phone within dedup window", async () => {
    const referralsBuilder = chainable({
      data: { id: "referral-1", referrer_id: "user-1" },
      error: null,
    }) as Record<string, unknown>;
    (referralsBuilder.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "referral-1", referrer_id: "user-1" },
      error: null,
    });
    (referralsBuilder.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "dup-1" },
      error: null,
    });
    const profilesBuilder = chainable({
      data: { organisation_id: "org-1" },
      error: null,
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "referrals") return referralsBuilder;
      if (table === "profiles") return profilesBuilder;
      throw new Error(`unexpected table ${table}`);
    });

    const { handleReferralCandidatePhone } = await import("@/lib/whatsapp/referral-handler");
    await handleReferralCandidatePhone("919888877777", "+91 90000 00000", {
      referral_id: "referral-1",
      candidate_name: "Alice",
      referrer_name: "Referrer One",
      referrer_id: "user-1",
      referrer_referrers_id: "referrer-1",
    });

    expect(mockCaptureConsentViaWhatsApp).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "metric.referral_rate_limited",
      expect.objectContaining({
        reason: "duplicate_resend_outreach",
        referrer_identity_kind: "referrers_id",
        referrer_phone_hash: expect.any(String),
        candidate_phone_hash: expect.any(String),
      }),
    );
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919888877777",
      expect.stringMatching(/submitted the WhatsApp invite|couldn't deliver/i),
    );
  });
});
