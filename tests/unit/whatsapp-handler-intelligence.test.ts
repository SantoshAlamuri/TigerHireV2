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
    const outcome = await mutate(session);
    if (!outcome) return null;
    const o = outcome as { state: string; context: Record<string, unknown>; extras?: unknown };
    if (o.extras === undefined) await mockUpdateSession(phone, o.state, o.context);
    else await mockUpdateSession(phone, o.state, o.context, o.extras);
    return { ...(session as Record<string, unknown>), session_state: o.state, context: o.context };
  }),
  SessionConflictError: class SessionConflictError extends Error {},
}));

const mockRunWhatsAppCvIngest = vi.fn();
vi.mock("@/lib/agents/scout", () => ({
  runWhatsAppCvIngest: (...args: unknown[]) => mockRunWhatsAppCvIngest(...args),
}));

const mockShouldSilence = vi.fn().mockResolvedValue(false);
vi.mock("@/lib/whatsapp/candidate-scope", () => ({
  shouldSilenceWhatsAppForPhone: (...args: unknown[]) => mockShouldSilence(...args),
}));

const mockUpdateLastCandidateMessage = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/repositories/SessionRepository", () => ({
  SessionRepository: {
    updateLastCandidateMessage: (...args: unknown[]) => mockUpdateLastCandidateMessage(...args),
  },
}));

vi.mock("@/lib/whatsapp/message-log", () => ({
  logWhatsAppInbound: vi.fn().mockResolvedValue(undefined),
  previewFromInboundMessage: vi.fn().mockReturnValue("preview"),
  recordInboundToApplicationThread: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/whatsapp/referral-handler", () => ({
  detectAndHandleReferral: vi.fn().mockResolvedValue({ handled: false }),
  handleReferralCandidatePhone: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/agents/verify", () => ({
  triggerVerifyAgent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/agents/vouch", () => ({
  handleVouchResponse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/agents/scheduler", () => ({
  handleSlotSelection: vi.fn().mockResolvedValue(undefined),
}));

const mockCreateApplicationFromWhatsApp = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/whatsapp/application-bridge", () => ({
  createApplicationFromWhatsApp: (...args: unknown[]) => mockCreateApplicationFromWhatsApp(...args),
}));

// Default to "no open gate" so existing tests keep exercising the normal state machine.
const mockHandlePrescreenReply = vi.fn().mockResolvedValue(false);
const mockRepromptOpenPrescreen = vi.fn().mockResolvedValue(false);
vi.mock("@/lib/prescreen/whatsapp-inbound", () => ({
  handlePrescreenWhatsappReply: (...args: unknown[]) => mockHandlePrescreenReply(...args),
  repromptOpenPrescreenQuestion: (...args: unknown[]) => mockRepromptOpenPrescreen(...args),
}));

vi.mock("@/lib/agents/consent", () => ({
  captureConsentViaWhatsApp: vi.fn().mockResolvedValue({ alreadyConsented: true, sent: true }),
  recordConsentResponse: vi.fn().mockResolvedValue({ consented: true }),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  }),
}));

const mockResolvePhoneIdentity = vi.fn();
vi.mock("@/lib/whatsapp/resolve-phone-identity", () => ({
  resolvePhoneIdentity: (...args: unknown[]) => mockResolvePhoneIdentity(...args),
}));

vi.mock("@/lib/services/assessment-share", () => ({
  submitAssessmentByToken: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/whatsapp/lane-a", () => ({
  handleLaneASingleJobScore: vi.fn().mockResolvedValue(undefined),
}));

const mockStartRoleGuidedFlow = vi.fn().mockResolvedValue(undefined);
const mockRouteRolePickReply = vi.fn().mockResolvedValue(false);
vi.mock("@/lib/whatsapp/role-guided-flow", () => ({
  handleRoleFamilySelectionReply: vi.fn().mockResolvedValue(undefined),
  handleRoleJobSelectionReply: vi.fn().mockResolvedValue(undefined),
  routeRolePickReply: (...args: unknown[]) => mockRouteRolePickReply(...args),
  startRoleGuidedFlow: (...args: unknown[]) => mockStartRoleGuidedFlow(...args),
  asRoleOptions: (raw: unknown) => (Array.isArray(raw) ? raw : []),
  asJobOptions: (raw: unknown) => (Array.isArray(raw) ? raw : []),
}));

vi.mock("@/lib/whatsapp/qa-flow", () => ({
  handleCollectingPreferencesReply: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/whatsapp/inbound-intent", () => ({
  BUSINESS_INQUIRY_FOLLOWUP_REPLY: "followup",
  MARKETING_HANDOFF_REPLY: "handoff",
  isCandidateIntentText: vi.fn().mockReturnValue(false),
  isMarketingHandoffText: vi.fn().mockReturnValue(false),
}));

const mockCreateNotificationBatch = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/services/notifications", () => ({
  createNotificationBatch: (...args: unknown[]) => mockCreateNotificationBatch(...args),
}));

const mockSendOpsAlert = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/observability/alerts", () => ({
  sendOpsAlert: (...args: unknown[]) => mockSendOpsAlert(...args),
}));

vi.mock("@/lib/services/ConsentService", () => ({
  ConsentService: { requestErasure: vi.fn(), recordConsentResponse: vi.fn() },
}));

vi.mock("@/lib/services/CandidateService", () => ({
  CandidateService: { eraseData: vi.fn() },
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("whatsapp handler intelligence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShouldSilence.mockResolvedValue(false);
    mockRunWhatsAppCvIngest.mockResolvedValue(null);
    mockHandlePrescreenReply.mockResolvedValue(false);
    mockRepromptOpenPrescreen.mockResolvedValue(false);
    mockStartRoleGuidedFlow.mockResolvedValue(undefined);
    mockCreateNotificationBatch.mockReset();
    mockSendOpsAlert.mockReset();
    mockResolvePhoneIdentity.mockResolvedValue({ candidateId: "cand-1" });
    mockAdminFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));
  });

  it("uses alternate fallback copy instead of repeating same response", async () => {
    const nowIso = new Date().toISOString();
    mockGetOrCreateSession.mockResolvedValue({
      id: "s-1",
      phone: "919999999999",
      session_state: "active_alerts",
      context: {
        last_assistant_reply_key: "portal_fallback",
        last_assistant_reply_at: nowIso,
      },
      last_message_at: nowIso,
      created_at: nowIso,
    });

    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [{ from: "919999999999", type: "text", text: { body: "what next from here" } }],
    });

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919999999999",
      expect.stringContaining("Still here with you"),
    );
  });

  it("acknowledges 'I sent CV' intelligently in alert state", async () => {
    const nowIso = new Date().toISOString();
    mockGetOrCreateSession.mockResolvedValue({
      id: "s-2",
      phone: "919888888888",
      session_state: "active_alerts",
      context: {},
      last_message_at: nowIso,
      created_at: nowIso,
    });

    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [{ from: "919888888888", type: "text", text: { body: "i have given the cv" } }],
    });

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919888888888",
      expect.stringContaining("I don't see a CV file in this chat yet"),
    );
    expect(mockUpdateSession).toHaveBeenCalledWith(
      "919888888888",
      "active_alerts",
      expect.objectContaining({
        last_assistant_reply_key: "cv_ack",
      }),
    );
  });

  it("closes conversation on thanks with a pause-style reply", async () => {
    const nowIso = new Date().toISOString();
    mockGetOrCreateSession.mockResolvedValue({
      id: "s-2b",
      phone: "919666666666",
      session_state: "active_alerts",
      context: {},
      last_message_at: nowIso,
      created_at: nowIso,
    });

    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [{ from: "919666666666", type: "text", text: { body: "thanks" } }],
    });

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919666666666",
      expect.stringContaining("I will pause here"),
    );
    expect(mockUpdateSession).toHaveBeenCalledWith(
      "919666666666",
      "active_alerts",
      expect.objectContaining({
        last_assistant_reply_key: "closure",
      }),
    );
  });

  it("pauses cleanly in preferences_complete instead of looping on another prompt", async () => {
    const nowIso = new Date().toISOString();
    mockGetOrCreateSession.mockResolvedValue({
      id: "s-pref-done",
      phone: "919666666667",
      session_state: "preferences_complete",
      context: { fit_score_eval_in_progress: true },
      last_message_at: nowIso,
      created_at: nowIso,
      qa_step: 2,
    });

    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [{ from: "919666666667", type: "text", text: { body: "done" } }],
    });

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919666666667",
      expect.stringContaining("I will pause here"),
    );
    expect(mockUpdateSession).toHaveBeenCalledWith(
      "919666666667",
      "preferences_complete",
      expect.objectContaining({
        conversation_outcome: "paused",
        unclear_turn_count: 0,
      }),
      expect.objectContaining({ qa_step: 2 }),
    );
  });

  it("answers STATUS during scoring with application status instead of another wait loop", async () => {
    const nowIso = new Date().toISOString();
    mockGetOrCreateSession.mockResolvedValue({
      id: "s-pref-status",
      phone: "919666666668",
      session_state: "preferences_complete",
      context: { fit_score_eval_in_progress: true },
      last_message_at: nowIso,
      created_at: nowIso,
      qa_step: 2,
    });

    const applicationsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            id: "app-1",
            status: "applied",
            job_id: "job-1",
            referral_link_id: "ref-link-1",
            direct_referrer_id: null,
            created_at: nowIso,
            jobs: { title: "QA Engineer", status: "open" },
          },
        ],
        error: null,
      }),
    };
    const pendingBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { job_id: "job-1" }, error: null }),
    };
    const scoreBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const profileBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profileBuilder;
      if (table === "applications") return applicationsBuilder;
      if (table === "pending_jd_approval") return pendingBuilder;
      if (table === "fit_scores") return scoreBuilder;
      throw new Error(`unexpected table in status test: ${table}`);
    });

    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [{ from: "919666666668", type: "text", text: { body: "STATUS" } }],
    });

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919666666668",
      expect.stringContaining("QA Engineer: Applied. FitScore queued. Referred application."),
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalledWith(
      "919666666668",
      expect.stringContaining("I am still evaluating your profile"),
    );
  });

  it("accepts PDF in active_alerts and routes through CV processing", async () => {
    const nowIso = new Date().toISOString();
    mockGetOrCreateSession.mockResolvedValue({
      id: "s-3",
      phone: "919777777777",
      session_state: "active_alerts",
      context: {},
      last_message_at: nowIso,
      created_at: nowIso,
    });

    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [
        {
          from: "919777777777",
          type: "document",
          id: "wa-msg-1",
          document: { id: "doc-123", filename: "resume.pdf", mime_type: "application/pdf" },
        },
      ],
    });

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919777777777",
      expect.stringContaining("Got your CV."),
    );
    expect(mockUpdateSession).toHaveBeenCalledWith(
      "919777777777",
      "cv_received",
      expect.objectContaining({ document_id: "doc-123" }),
    );
    expect(mockRunWhatsAppCvIngest).toHaveBeenCalledTimes(1);
  });

  it("routes unsolicited acknowledgement reply to business inquiry instead of consent/referral flow", async () => {
    const nowIso = new Date().toISOString();
    mockGetOrCreateSession.mockResolvedValue({
      id: "s-unsolicited",
      phone: "919444444444",
      session_state: "new",
      context: {},
      last_message_at: nowIso,
      created_at: nowIso,
    });

    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [{ from: "919444444444", type: "text", text: { body: "Who is this?" } }],
    });

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919444444444",
      expect.stringContaining("This is TigerHire"),
    );
    expect(mockUpdateSession).toHaveBeenCalledWith(
      "919444444444",
      "business_inquiry",
      expect.objectContaining({
        inbound_route: "unsolicited_ack_reply",
      }),
    );
  });

  it("accepts PDF in scored state and routes through CV processing", async () => {
    const nowIso = new Date().toISOString();
    mockGetOrCreateSession.mockResolvedValue({
      id: "s-4",
      phone: "919555555555",
      session_state: "scored",
      context: {},
      last_message_at: nowIso,
      created_at: nowIso,
    });

    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [
        {
          from: "919555555555",
          type: "document",
          id: "wa-msg-2",
          document: { id: "doc-456", filename: "resume-v2.pdf", mime_type: "application/pdf" },
        },
      ],
    });

    expect(mockUpdateSession).toHaveBeenCalledWith(
      "919555555555",
      "cv_received",
      expect.objectContaining({ document_id: "doc-456" }),
    );
    expect(mockRunWhatsAppCvIngest).toHaveBeenCalledTimes(1);
  });

  it("a digit reply in scored state re-prompts an open prescreen question instead of filing an application", async () => {
    // interactive.ts maps 1→YES / 2→NO, and the gate deliberately lets pure digits
    // fall through — the scored handler must not swallow them as role picks while a
    // questionnaire is open.
    const nowIso = new Date().toISOString();
    mockGetOrCreateSession.mockResolvedValue({
      id: "s-scored-digit",
      phone: "919123412341",
      session_state: "scored",
      context: {},
      last_message_at: nowIso,
      created_at: nowIso,
    });
    mockRepromptOpenPrescreen.mockResolvedValue(true);

    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [{ from: "919123412341", type: "text", text: { body: "1" } }],
    });

    expect(mockRepromptOpenPrescreen).toHaveBeenCalledWith("919123412341");
    expect(mockCreateApplicationFromWhatsApp).not.toHaveBeenCalled();
  });

  it("a digit reply in scored state still files an application when no prescreen session is open", async () => {
    const nowIso = new Date().toISOString();
    mockGetOrCreateSession.mockResolvedValue({
      id: "s-scored-apply",
      phone: "919123412342",
      session_state: "scored",
      context: {},
      last_message_at: nowIso,
      created_at: nowIso,
    });
    mockRepromptOpenPrescreen.mockResolvedValue(false);

    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [{ from: "919123412342", type: "text", text: { body: "2" } }],
    });

    expect(mockCreateApplicationFromWhatsApp).toHaveBeenCalledWith(
      "919123412342",
      2,
      expect.anything(),
    );
  });

  it("shows open roles in cv_requested when user asks without CV", async () => {
    const nowIso = new Date().toISOString();
    mockGetOrCreateSession.mockResolvedValue({
      id: "s-5",
      phone: "919444444444",
      session_state: "cv_requested",
      context: {},
      last_message_at: nowIso,
      created_at: nowIso,
    });
    const qb = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      limit: vi.fn().mockResolvedValue({
        data: [{ title: "Backend Engineer", organisations: { name: "TigerHire" } }],
        error: null,
      }),
    };
    mockAdminFrom.mockReturnValue(qb);

    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [
        {
          from: "919444444444",
          type: "text",
          text: { body: "i dont have a cv what are the open roles" },
        },
      ],
    });

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919444444444",
      expect.stringContaining("Here are some open roles right now"),
    );
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919444444444",
      expect.stringContaining("Backend Engineer"),
    );
  });

  it("hands over to human on explicit request in active_alerts", async () => {
    const nowIso = new Date().toISOString();
    mockGetOrCreateSession.mockResolvedValue({
      id: "s-6",
      phone: "919333333333",
      session_state: "active_alerts",
      context: {},
      last_message_at: nowIso,
      created_at: nowIso,
    });
    const handoverQb = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      limit: vi.fn().mockResolvedValue({ data: [{ id: "admin-1" }], error: null }),
    };
    mockAdminFrom.mockReturnValue(handoverQb);

    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [
        { from: "919333333333", type: "text", text: { body: "connect me to human support" } },
      ],
    });

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919333333333",
      expect.stringContaining("handing this to our hiring support team"),
    );
    expect(mockUpdateSession).toHaveBeenCalledWith(
      "919333333333",
      "active_alerts",
      expect.objectContaining({
        conversation_outcome: "handover",
        handover_reason: "requested",
      }),
    );
    expect(mockCreateNotificationBatch).toHaveBeenCalled();
    expect(mockSendOpsAlert).toHaveBeenCalled();
  });

  it("auto-handover after repeated unclear turns in cv_requested", async () => {
    const nowIso = new Date().toISOString();
    mockGetOrCreateSession.mockResolvedValue({
      id: "s-7",
      phone: "919222222222",
      session_state: "cv_requested",
      context: { unclear_turn_count: 2 },
      last_message_at: nowIso,
      created_at: nowIso,
    });

    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [{ from: "919222222222", type: "text", text: { body: "hmm" } }],
    });

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919222222222",
      expect.stringContaining("handing this to our hiring support team"),
    );
    expect(mockUpdateSession).toHaveBeenCalledWith(
      "919222222222",
      "cv_requested",
      expect.objectContaining({
        conversation_outcome: "handover",
        handover_reason: "unclear_loop",
      }),
    );
  });

  it("stays silent while human takeover lock is active", async () => {
    const nowIso = new Date().toISOString();
    const futureIso = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    mockGetOrCreateSession.mockResolvedValue({
      id: "s-8",
      phone: "919111111111",
      session_state: "active_alerts",
      context: { human_takeover_active: true, human_takeover_until: futureIso },
      last_message_at: nowIso,
      created_at: nowIso,
    });

    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [{ from: "919111111111", type: "text", text: { body: "hello?" } }],
    });

    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });
});

describe("whatsapp handler STOP / opt-out", () => {
  type RecordedCall = { table: string; method: string; args: unknown[] };

  function installStopAdminMock(candidateIds: string[]) {
    const calls: RecordedCall[] = [];
    mockAdminFrom.mockImplementation((...fromArgs: unknown[]) => {
      const table = String(fromArgs[0]);
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "update", "eq", "neq", "in", "order", "limit"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return builder;
        };
      }
      // Thenable: awaiting any point in the chain resolves with table data.
      builder.then = (resolve: (v: { data: unknown[]; error: null }) => void) => {
        resolve({
          data: table === "candidates" ? candidateIds.map((id) => ({ id })) : [],
          error: null,
        });
      };
      builder.maybeSingle = async () => ({ data: null, error: null });
      builder.single = async () => ({ data: null, error: null });
      return builder;
    });
    return calls;
  }

  it("STOP completes open prescreen sessions, sets do_not_call, and the confirmation bypasses the opt-out gate", async () => {
    const nowIso = new Date().toISOString();
    mockGetOrCreateSession.mockResolvedValue({
      id: "s-stop",
      phone: "919555555555",
      session_state: "active_alerts",
      context: {},
      last_message_at: nowIso,
      created_at: nowIso,
    });
    const calls = installStopAdminMock(["cand-1"]);

    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [{ from: "919555555555", type: "text", text: { body: "STOP" } }],
    });

    // do_not_call flipped on the candidate rows for this phone.
    const candidateUpdates = calls.filter((c) => c.table === "candidates" && c.method === "update");
    expect(candidateUpdates.length).toBeGreaterThan(0);
    expect(candidateUpdates[0].args[0]).toMatchObject({ do_not_call: true });

    // Open prescreen sessions are completed (no further prompts/reminders).
    const prescreenUpdates = calls.filter(
      (c) => c.table === "prescreen_sessions" && c.method === "update",
    );
    expect(prescreenUpdates).toHaveLength(1);
    expect(prescreenUpdates[0].args[0]).toMatchObject({
      state: "complete",
      completed_at: expect.any(String),
    });
    const prescreenNeq = calls.filter(
      (c) => c.table === "prescreen_sessions" && c.method === "neq",
    );
    expect(prescreenNeq[0]?.args).toEqual(["state", "complete"]);
    const prescreenIn = calls.filter((c) => c.table === "prescreen_sessions" && c.method === "in");
    expect(prescreenIn[0]?.args).toEqual(["candidate_id", ["cand-1"]]);

    // Screening jobs are cancelled.
    const screeningUpdates = calls.filter(
      (c) => c.table === "screening_jobs" && c.method === "update",
    );
    expect(screeningUpdates.length).toBeGreaterThan(0);
    expect(screeningUpdates[0].args[0]).toMatchObject({ status: "cancelled" });

    // The STOP confirmation itself still delivers, past the do-not-contact gate.
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919555555555",
      expect.stringContaining("You have been removed"),
      { bypassOptOutGate: true },
    );

    // Session parked as opted_out.
    expect(mockUpdateSession).toHaveBeenCalledWith(
      "919555555555",
      "opted_out",
      expect.objectContaining({ opt_out_source: "inbound_keyword" }),
    );
  });

  it("STOP with no candidate rows still confirms and skips the prescreen update", async () => {
    const nowIso = new Date().toISOString();
    mockGetOrCreateSession.mockResolvedValue({
      id: "s-stop-2",
      phone: "919555500000",
      session_state: "new",
      context: {},
      last_message_at: nowIso,
      created_at: nowIso,
    });
    const calls = installStopAdminMock([]);

    const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
    await handleInboundMessage({
      messages: [{ from: "919555500000", type: "text", text: { body: "unsubscribe" } }],
    });

    expect(calls.filter((c) => c.table === "prescreen_sessions")).toHaveLength(0);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919555500000",
      expect.stringContaining("You have been removed"),
      { bypassOptOutGate: true },
    );
  });
});
