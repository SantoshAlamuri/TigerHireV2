import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSendWhatsAppMessage = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/services/whatsapp", () => ({
  sendWhatsAppMessage: (...args: unknown[]) => mockSendWhatsAppMessage(...args),
}));

const mockGetOrCreateSession = vi.fn();
const mockUpdateSession = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/whatsapp/sessions", () => ({
  getOrCreateSession: (...args: unknown[]) => mockGetOrCreateSession(...args),
  updateSession: (...args: unknown[]) => mockUpdateSession(...args),
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

vi.mock("@/lib/agents/scout", () => ({ runWhatsAppCvIngest: vi.fn() }));
vi.mock("@/lib/agents/verify", () => ({ triggerVerifyAgent: vi.fn() }));
vi.mock("@/lib/whatsapp/referral-handler", () => ({
  detectAndHandleReferral: vi.fn().mockResolvedValue({ handled: false }),
  handleReferralCandidatePhone: vi.fn(),
}));
vi.mock("@/lib/whatsapp/referral-flow", () => ({
  handleRegisteredReferrerInbound: vi.fn().mockResolvedValue({ handled: false }),
  looksLikeApplyIntent: vi.fn(),
  parseApplyPrefillHints: vi.fn(),
  switchToCandidateApplyFlow: vi.fn(),
}));
vi.mock("@/lib/whatsapp/candidate-scope", () => ({
  shouldSilenceWhatsAppForPhone: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/repositories/SessionRepository", () => ({
  SessionRepository: { updateLastCandidateMessage: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/lib/whatsapp/message-log", () => ({
  logWhatsAppInbound: vi.fn().mockResolvedValue(undefined),
  previewFromInboundMessage: vi.fn().mockReturnValue(""),
  recordInboundToApplicationThread: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/whatsapp/sync-session-consent", () => ({
  syncSessionWithConsent: vi.fn().mockResolvedValue({ advanced: false }),
}));
vi.mock("@/lib/screening/whatsapp-flow", () => ({
  handleScreeningWhatsappReply: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/agents/consent", () => ({
  captureConsentViaWhatsApp: vi.fn(),
  recordConsentResponse: vi.fn(),
}));
vi.mock("@/lib/services/ConsentService", () => ({
  ConsentService: {
    hasRequiredConsent: vi.fn().mockResolvedValue(false),
    requestErasure: vi.fn(),
    recordConsentResponse: vi.fn(),
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: vi.fn() }),
}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockRecordConsentResponse = vi.fn().mockResolvedValue({ consented: true });

beforeEach(async () => {
  vi.clearAllMocks();
  const consent = await import("@/lib/agents/consent");
  vi.mocked(consent.recordConsentResponse).mockImplementation(mockRecordConsentResponse);
  mockRecordConsentResponse.mockResolvedValue({ consented: true });

  const nowIso = new Date().toISOString();
  mockGetOrCreateSession.mockResolvedValue({
    id: "sess-consent",
    phone: "919876543210",
    session_state: "awaiting_consent",
    context: {},
    last_message_at: nowIso,
    created_at: nowIso,
  });
});

describe("awaiting_consent — normalizeReplyText routing", () => {
  it("routes a tapped YES (button_reply) into recordConsentResponse as yes", async () => {
    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [
        {
          from: "919876543210",
          type: "interactive",
          interactive: {
            type: "button_reply",
            button_reply: { id: "yes", title: "Yes" },
          },
        },
      ],
    });

    expect(mockRecordConsentResponse).toHaveBeenCalledWith(
      expect.anything(),
      "919876543210",
      "yes",
    );
  });

  it("routes typed yes unchanged (regression)", async () => {
    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [
        {
          from: "919876543210",
          type: "text",
          text: { body: "yes" },
        },
      ],
    });

    expect(mockRecordConsentResponse).toHaveBeenCalledWith(
      expect.anything(),
      "919876543210",
      "yes",
    );
  });

  it("routes typed no unchanged (regression)", async () => {
    mockRecordConsentResponse.mockResolvedValue({ consented: false });
    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [
        {
          from: "919876543210",
          type: "text",
          text: { body: "no" },
        },
      ],
    });

    expect(mockRecordConsentResponse).toHaveBeenCalledWith(expect.anything(), "919876543210", "no");
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919876543210",
      expect.stringContaining("Understood"),
    );
  });

  it("routes tapped NO (button.text) into recordConsentResponse as no", async () => {
    mockRecordConsentResponse.mockResolvedValue({ consented: false });
    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [
        {
          from: "919876543210",
          type: "button",
          button: { text: "No" },
        },
      ],
    });

    expect(mockRecordConsentResponse).toHaveBeenCalledWith(expect.anything(), "919876543210", "no");
  });
});
