import { beforeEach, describe, expect, it, vi } from "vitest";

type SessionState = {
  phone: string;
  session_state: string;
  context: Record<string, unknown>;
};

type FakeDb = {
  profiles: Array<Record<string, unknown>>;
  referrers: Array<Record<string, unknown>>;
  referrals: Array<Record<string, unknown>>;
  candidates: Array<Record<string, unknown>>;
  applications: Array<Record<string, unknown>>;
  consent_records: Array<Record<string, unknown>>;
  jobs: Array<Record<string, unknown>>;
  whatsapp_sessions: Array<Record<string, unknown>>;
};

const fakeDb: FakeDb = {
  profiles: [],
  referrers: [],
  referrals: [],
  candidates: [],
  applications: [],
  consent_records: [],
  jobs: [],
  whatsapp_sessions: [],
};

const sessionStore = new Map<string, SessionState>();
const outboundMessages: Array<{ phone: string; body: string }> = [];
const flagState: Record<string, boolean> = {};

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

function fakeUuid(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

class Builder {
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private limitCount: number | null = null;
  private pendingInsert: Record<string, unknown> | null = null;
  private pendingUpdate: Record<string, unknown> | null = null;

  constructor(private table: keyof FakeDb) {}

  select() {
    return this;
  }

  insert(payload: Record<string, unknown>) {
    this.pendingInsert = payload;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.pendingUpdate = payload;
    return this;
  }

  eq(key: string, value: unknown) {
    this.filters.push((row) => row[key] === value);
    return this;
  }

  neq(key: string, value: unknown) {
    this.filters.push((row) => row[key] !== value);
    return this;
  }

  gte(key: string, value: unknown) {
    this.filters.push((row) => String(row[key] ?? "") >= String(value ?? ""));
    return this;
  }

  is(key: string, value: unknown) {
    this.filters.push((row) => (value === null ? row[key] == null : row[key] === value));
    return this;
  }

  in(key: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[key]));
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  order() {
    return this;
  }

  maybeSingle = async () => {
    const rows = this.execute();
    return { data: rows[0] ?? null, error: null };
  };

  single = async () => {
    const rows = this.execute();
    return { data: rows[0] ?? null, error: null };
  };

  then = (resolve: (value: unknown) => void) => {
    resolve({ data: this.execute(), error: null });
  };

  private execute() {
    const tableRows = fakeDb[this.table] ?? [];

    if (this.pendingInsert) {
      const row = { ...this.pendingInsert };
      if (!row.id) row.id = fakeUuid(String(this.table), tableRows.length);
      if (!row.created_at) row.created_at = new Date().toISOString();
      tableRows.push(row);
      return [row];
    }

    let selected = tableRows.filter((row) => this.filters.every((fn) => fn(row)));

    if (this.pendingUpdate) {
      for (const row of selected) Object.assign(row, this.pendingUpdate);
      return selected;
    }

    if (this.limitCount != null) selected = selected.slice(0, this.limitCount);
    return selected;
  }
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (table: keyof FakeDb) => new Builder(table),
  }),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendWhatsAppMessage: async (phone: string, body: string) => {
    outboundMessages.push({ phone: normalizePhone(phone), body });
    return { success: true };
  },
}));

vi.mock("@/lib/whatsapp/sessions", () => {
  const setSession = (phone: string, state: string, context: Record<string, unknown>) => {
    const normalized = normalizePhone(phone);
    sessionStore.set(normalized, {
      phone: normalized,
      session_state: state,
      context: { ...context },
    });
  };
  return {
    getOrCreateSession: async (phone: string) => {
      const normalized = normalizePhone(phone);
      if (!sessionStore.has(normalized)) {
        sessionStore.set(normalized, { phone: normalized, session_state: "new", context: {} });
      }
      return sessionStore.get(normalized);
    },
    updateSession: async (phone: string, state: string, context: Record<string, unknown>) => {
      setSession(phone, state, context);
    },
    withSessionCAS: async (phone: string, mutate: (s: unknown) => Promise<unknown> | unknown) => {
      const normalized = normalizePhone(phone);
      const session = sessionStore.get(normalized) ?? {
        phone: normalized,
        session_state: "new",
        context: {},
      };
      const outcome = await mutate(session);
      if (!outcome) return null;
      const o = outcome as { state: string; context: Record<string, unknown> };
      setSession(phone, o.state, o.context);
      return { ...session, session_state: o.state, context: { ...o.context } };
    },
    SessionConflictError: class SessionConflictError extends Error {},
  };
});

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: async (key: string) => flagState[key] ?? true,
}));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 999 }),
}));

vi.mock("@/lib/agents/consent", () => ({
  captureConsentViaWhatsApp: async (_supa: unknown, phone: string) => {
    const normalized = normalizePhone(phone);
    const session = sessionStore.get(normalized);
    sessionStore.set(normalized, {
      phone: normalized,
      session_state: "awaiting_consent",
      context: { ...(session?.context ?? {}) },
    });
    return { alreadyConsented: false, sent: true, via: "template" };
  },
  recordConsentResponse: async (_supa: unknown, phone: string, response: string) => {
    const normalized = normalizePhone(phone);
    const accepted = /^y(es)?$/i.test(response.trim());
    fakeDb.consent_records.push({
      id: fakeUuid("consent", fakeDb.consent_records.length),
      phone: normalized,
      consented: accepted,
    });
    sessionStore.set(normalized, {
      phone: normalized,
      session_state: accepted ? "consent_given" : "opted_out",
      context: { ...(sessionStore.get(normalized)?.context ?? {}) },
    });
    return { consented: accepted };
  },
}));

vi.mock("@/lib/agents/scout", () => ({
  runWhatsAppCvIngest: async (input: {
    phone: string;
    session_context: Record<string, unknown>;
  }) => {
    const candidateId = fakeUuid("candidate", fakeDb.candidates.length);
    fakeDb.candidates.push({
      id: candidateId,
      phone: normalizePhone(input.phone),
      name: "Candidate",
    });
    const referralId = input.session_context?.referral_id as string | undefined;
    if (referralId) {
      const referral = fakeDb.referrals.find((r) => r.id === referralId);
      if (referral) {
        referral.candidate_id = candidateId;
        referral.status = "cv_received";
      }
    }
    return { candidateId };
  },
}));

vi.mock("@/lib/agents/verify", () => ({
  triggerVerifyAgent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/agents/scheduler", () => ({
  handleSlotSelection: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/agents/vouch", () => ({
  handleVouchResponse: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/whatsapp/lane-a", () => ({
  handleLaneASingleJobScore: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/whatsapp/qa-flow", () => ({
  handleCollectingPreferencesReply: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/whatsapp/role-guided-flow", () => ({
  startRoleGuidedFlow: async (phone: string, context: Record<string, unknown>) => {
    sessionStore.set(normalizePhone(phone), {
      phone: normalizePhone(phone),
      session_state: "scored",
      context: {
        ...context,
        top_matches: [{ job_id: "job-1", title: "PM", company: "Acme", score: 86 }],
      },
    });
  },
  handleRoleFamilySelectionReply: vi.fn().mockResolvedValue(undefined),
  handleRoleJobSelectionReply: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/whatsapp/application-bridge", () => ({
  createApplicationFromWhatsApp: async (
    phone: string,
    _choice: number,
    context: Record<string, unknown>,
  ) => {
    fakeDb.applications.push({
      id: fakeUuid("application", fakeDb.applications.length),
      candidate_phone: normalizePhone(phone),
      candidate_id: context.candidate_id ?? null,
      direct_referrer_id: context.direct_referrer_id ?? null,
      parent_referrer_id: context.parent_referrer_id ?? null,
    });
    sessionStore.set(normalizePhone(phone), {
      phone: normalizePhone(phone),
      session_state: "complete",
      context: { ...context },
    });
  },
}));
vi.mock("@/lib/whatsapp/candidate-scope", () => ({
  shouldSilenceWhatsAppForPhone: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/whatsapp/send-outbound", () => ({
  sendWhatsAppOutbound: vi.fn().mockResolvedValue({ success: false, error: "mock_skip_utility" }),
  referralUtilityTemplateIncludesConsent: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/whatsapp/templates", () => ({
  sendReferralInvite: vi.fn().mockResolvedValue({ success: false, error: "mock_skip_invite" }),
}));
vi.mock("@/lib/whatsapp/sync-session-consent", () => ({
  syncSessionWithConsent: vi.fn().mockResolvedValue({ advanced: false }),
  prepareSessionAfterEmployeeReferral: async (
    _supabase: unknown,
    phone: string,
    context: Record<string, unknown>,
  ) => {
    const { updateSession } = await import("@/lib/whatsapp/sessions");
    const nextState = flagState.whatsapp_referral_consent_v2 ? "awaiting_consent" : "cv_requested";
    await updateSession(phone, nextState, context);
    return nextState;
  },
}));
vi.mock("@/lib/referrers/resolve-referrer-identity", () => ({
  resolveOrCreateReferrerIdentityForFlow: vi.fn().mockResolvedValue({
    directReferrerId: "ref-1",
    parentReferrerId: null,
  }),
}));
vi.mock("@/lib/whatsapp/message-log", () => ({
  hasRecentInboundFromPhone: vi.fn().mockResolvedValue(true),
  logWhatsAppInbound: vi.fn().mockResolvedValue(undefined),
  logWhatsAppOutbound: vi.fn().mockResolvedValue(undefined),
  previewFromInboundMessage: vi.fn(() => ""),
  previewFromOutboundPayload: vi.fn().mockReturnValue({ messageType: "template", bodyPreview: "" }),
  recordInboundToApplicationThread: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/repositories/SessionRepository", () => ({
  SessionRepository: { updateLastCandidateMessage: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/lib/services/assessment-share", () => ({
  submitAssessmentByToken: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/config/env", () => ({
  env: {
    referralDailyCap: 20,
    referralTargetDedupWindowHours: 0,
  },
}));
vi.mock("@/lib/services/ConsentService", () => ({
  ConsentService: {
    requestErasure: vi.fn(),
    hasRequiredConsent: vi.fn().mockResolvedValue(false),
  },
}));
vi.mock("@/lib/services/CandidateService", () => ({ CandidateService: { eraseData: vi.fn() } }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

async function sendText(phone: string, body: string) {
  const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
  await handleInboundMessage({
    messages: [{ from: phone, type: "text", text: { body } }],
  });
}

async function sendDocument(phone: string, documentId: string) {
  const { handleInboundMessage } = await import("@/lib/whatsapp/handler");
  await handleInboundMessage({
    messages: [{ from: phone, type: "document", document: { id: documentId } }],
  });
}

describe("referral e2e scaffold (webhook-driven simulation)", () => {
  beforeEach(() => {
    vi.resetModules();
    fakeDb.profiles = [
      {
        id: "user-ref-1",
        phone: "919000000001",
        full_name: "Referrer One",
        role: "employee",
        organisation_id: "org-1",
      },
    ];
    fakeDb.referrers = [];
    fakeDb.referrals = [];
    fakeDb.candidates = [];
    fakeDb.applications = [];
    fakeDb.consent_records = [];
    fakeDb.jobs = [];
    fakeDb.whatsapp_sessions = [];
    sessionStore.clear();
    outboundMessages.length = 0;
    flagState.whatsapp_referral_consent_v2 = false;
  });

  it("covers legacy path end-to-end and refer-again loop (Alice then Bob)", async () => {
    const referrerPhone = "919000000001";
    const alicePhone = "919000000002";
    const bobPhone = "919000000003";

    await sendText(referrerPhone, "Refer Alice - Product Manager - Bangalore");
    await sendText(referrerPhone, alicePhone);

    // Candidate legacy path skips consent and moves directly to CV request.
    expect(sessionStore.get(alicePhone)?.session_state).toBe("cv_requested");
    expect(fakeDb.referrals).toHaveLength(1);
    expect(fakeDb.referrals[0].target_phone).toBe(alicePhone);

    await sendDocument(alicePhone, "doc-alice");
    await sendText(alicePhone, "1");

    expect(fakeDb.referrals[0].candidate_id).toBeTruthy();
    expect(fakeDb.referrals[0].status).toBe("cv_received");
    expect(fakeDb.applications).toHaveLength(1);
    expect(fakeDb.applications[0].direct_referrer_id).toBeTruthy();

    // Refer-again loop for Bob (keep message short — long refer lines route to status/resend).
    await sendText(referrerPhone, "refer");
    await sendText(referrerPhone, "Bob");
    await sendText(referrerPhone, bobPhone);
    expect(fakeDb.referrals).toHaveLength(2);
    expect(fakeDb.referrals[1].target_phone).toBe(bobPhone);
  });

  it("covers consent-flag ON YES branch", async () => {
    flagState.whatsapp_referral_consent_v2 = true;
    const referrerPhone = "919000000001";
    const candidatePhone = "919000000010";

    await sendText(referrerPhone, "Refer Alice - Product Manager - Bangalore");
    await sendText(referrerPhone, candidatePhone);
    expect(sessionStore.get(candidatePhone)?.session_state).toBe("awaiting_consent");

    await sendText(candidatePhone, "YES");
    expect(sessionStore.get(candidatePhone)?.session_state).toBe("cv_requested");
    expect(fakeDb.consent_records.at(-1)?.consented).toBe(true);

    await sendDocument(candidatePhone, "doc-consent-yes");
    await sendText(candidatePhone, "1");
    expect(fakeDb.applications).toHaveLength(1);
  });

  it("covers consent-flag ON NO branch", async () => {
    flagState.whatsapp_referral_consent_v2 = true;
    const referrerPhone = "919000000001";
    const candidatePhone = "919000000011";

    await sendText(referrerPhone, "Refer Alice - Product Manager - Bangalore");
    await sendText(referrerPhone, candidatePhone);
    expect(sessionStore.get(candidatePhone)?.session_state).toBe("awaiting_consent");

    await sendText(candidatePhone, "NO");
    expect(sessionStore.get(candidatePhone)?.session_state).toBe("opted_out");
    expect(fakeDb.consent_records.at(-1)?.consented).toBe(false);
    expect(fakeDb.applications).toHaveLength(0);
  });
});
