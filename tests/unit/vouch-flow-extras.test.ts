/**
 * Tests for the vouch-flow ergonomic improvements:
 *  - startVouchFlow free-text fallback when the template send fails (P0 silent failure)
 *  - startVouchFlow stashes prior_session when the voucher is mid-candidate flow
 *  - handleVouchResponse honors "skip" / "stop" / "later" decline tokens
 *  - handleVouchResponse Q3 multi-select echoes selections back and rejects garbage
 *  - Q5 completion restores prior_session when present (voucher dual-state)
 *  - saveVouch best-effort social proof to the candidate after trust recalculation
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockCallClaude = vi.fn();
const mockIsEnabled = vi.fn();
const mockRpc = vi.fn();
const mockLoggerInfo = vi.fn();
const mockLoggerWarn = vi.fn();
const mockSendWhatsAppMessage = vi.fn();
const mockSendTemplateMessage = vi.fn();
const mockUpdateSession = vi.fn();
const mockGetOrCreateSession = vi.fn();
const mockRecalculateTrustScore = vi.fn();

let tableBuilders: Record<string, ReturnType<typeof createMockQueryBuilder>[]>;

function nextBuilder(table: string) {
  const queue = tableBuilders[table] ?? [];
  if (queue.length === 0) return createMockQueryBuilder();
  const [first, ...rest] = queue;
  tableBuilders[table] = rest;
  return first;
}

vi.mock("@/lib/services/anthropic", () => ({
  callClaude: (...args: unknown[]) => mockCallClaude(...args),
  extractJsonObject: () => ({
    specificity_score: 80,
    credibility_multiplier: 1.0,
    summary: "specific",
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => nextBuilder(table),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendWhatsAppMessage: (...args: unknown[]) => mockSendWhatsAppMessage(...args),
  sendTemplateMessage: (...args: unknown[]) => mockSendTemplateMessage(...args),
}));

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

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: (...args: unknown[]) => mockIsEnabled(...args),
}));

vi.mock("@/lib/agents/trust-score", () => ({
  recalculateTrustScore: (...args: unknown[]) => mockRecalculateTrustScore(...args),
}));

vi.mock("@/lib/observability/metrics", () => ({
  logAgentRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

beforeEach(() => {
  tableBuilders = {};
  mockCallClaude.mockReset();
  mockIsEnabled.mockReset();
  mockRpc.mockReset();
  mockLoggerInfo.mockReset();
  mockLoggerWarn.mockReset();
  mockSendWhatsAppMessage.mockReset();
  mockSendTemplateMessage.mockReset();
  mockUpdateSession.mockReset();
  mockGetOrCreateSession.mockReset();
  mockRecalculateTrustScore.mockReset();

  mockCallClaude.mockResolvedValue({
    text: '{"specificity_score":80,"credibility_multiplier":1.0,"summary":"specific"}',
    usage: { input_tokens: 100, output_tokens: 20 },
  });
  mockIsEnabled.mockResolvedValue(true);
  mockRpc.mockResolvedValue({ data: false, error: null });
  mockSendWhatsAppMessage.mockResolvedValue({ success: true });
  mockSendTemplateMessage.mockResolvedValue({ success: true });
  mockUpdateSession.mockResolvedValue(undefined);
  mockGetOrCreateSession.mockResolvedValue({
    phone: "919900001111",
    session_state: "complete",
    context: {},
  });
  mockRecalculateTrustScore.mockResolvedValue(67);
});

describe("startVouchFlow — kickoff delivery + dual-state preservation", () => {
  it("falls back to a single combined free-text message when the template send fails (no silent drop)", async () => {
    mockSendTemplateMessage.mockResolvedValueOnce({
      success: false,
      error: "template_unapproved",
    });
    mockSendWhatsAppMessage.mockResolvedValueOnce({ success: true });

    tableBuilders.applications = [createMockQueryBuilder({ data: null, error: null })];
    tableBuilders.jobs = [createMockQueryBuilder({ data: null, error: null })];

    const { startVouchFlow } = await import("@/lib/agents/vouch");
    await startVouchFlow("919900002222", "cand-1", "Alice");

    expect(mockSendTemplateMessage).toHaveBeenCalledTimes(1);
    // Combined fallback message must include both intro + Q1 prompt content.
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const [, body] = mockSendWhatsAppMessage.mock.calls[0] as [string, string];
    expect(body).toContain("Alice");
    expect(body).toContain("How did you work with Alice");
    expect(body.toLowerCase()).toContain("skip");

    // Session must be advanced to vouch_q1 with a kickoff_via marker.
    expect(mockUpdateSession).toHaveBeenCalledWith(
      "919900002222",
      "vouch_q1",
      expect.objectContaining({
        candidate_id: "cand-1",
        candidate_name: "Alice",
        kickoff_via: "text_combined",
      }),
    );
  });

  it("does not advance the session when ALL kickoff delivery paths fail", async () => {
    mockSendTemplateMessage.mockResolvedValueOnce({ success: false, error: "fail-template" });
    mockSendWhatsAppMessage.mockResolvedValueOnce({ success: false, error: "fail-text" });

    tableBuilders.applications = [createMockQueryBuilder({ data: null, error: null })];
    tableBuilders.jobs = [createMockQueryBuilder({ data: null, error: null })];

    const { startVouchFlow } = await import("@/lib/agents/vouch");
    await startVouchFlow("919900002222", "cand-1", "Alice");

    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it("stashes prior_session when the voucher was mid-candidate flow (dual-state)", async () => {
    mockGetOrCreateSession.mockResolvedValueOnce({
      phone: "919900003333",
      session_state: "scored",
      context: { last_top_match_job_id: "job-7", note: "in flight" },
    });

    tableBuilders.applications = [createMockQueryBuilder({ data: null, error: null })];
    tableBuilders.jobs = [createMockQueryBuilder({ data: null, error: null })];

    const { startVouchFlow } = await import("@/lib/agents/vouch");
    await startVouchFlow("919900003333", "cand-2", "Bob");

    expect(mockUpdateSession).toHaveBeenCalledWith(
      "919900003333",
      "vouch_q1",
      expect.objectContaining({
        candidate_id: "cand-2",
        candidate_name: "Bob",
        prior_session: {
          state: "scored",
          context: { last_top_match_job_id: "job-7", note: "in flight" },
        },
      }),
    );
  });

  it("does not stash prior_session for terminal states like 'complete'", async () => {
    mockGetOrCreateSession.mockResolvedValueOnce({
      phone: "919900004444",
      session_state: "complete",
      context: {},
    });

    tableBuilders.applications = [createMockQueryBuilder({ data: null, error: null })];
    tableBuilders.jobs = [createMockQueryBuilder({ data: null, error: null })];

    const { startVouchFlow } = await import("@/lib/agents/vouch");
    await startVouchFlow("919900004444", "cand-3", "Carol");

    const updateCall = mockUpdateSession.mock.calls.find(
      (call: unknown[]) => call[0] === "919900004444" && call[1] === "vouch_q1",
    ) as unknown[] | undefined;
    expect(updateCall).toBeDefined();
    const updatedContext = updateCall?.[2] as Record<string, unknown>;
    expect(updatedContext.prior_session).toBeUndefined();
  });
});

describe("handleVouchResponse — decline tokens", () => {
  it.each(["skip", "STOP", "decline", "not now", "Maybe Later", "later", "cancel"])(
    "exits cleanly on '%s' without scoring or saving",
    async (token) => {
      const { handleVouchResponse } = await import("@/lib/agents/vouch");
      await handleVouchResponse("919900005555", token, "vouch_q1", {
        candidate_id: "cand-1",
        candidate_name: "Alice",
        vouch_data: {},
      });

      expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
        "919900005555",
        expect.stringContaining("No problem"),
      );
      expect(mockUpdateSession).toHaveBeenCalledWith("919900005555", "complete", {});
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "metric.vouch_flow_declined",
        expect.objectContaining({ candidate_id: "cand-1", at_question: "q1" }),
      );
      expect(mockCallClaude).not.toHaveBeenCalled();
    },
  );

  it("does NOT treat 'not sure' as a decline (it is a valid Q5 option)", async () => {
    tableBuilders.vouches = [
      createMockQueryBuilder({ data: null, error: null }),
      createMockQueryBuilder({ data: null, error: null }),
      createMockQueryBuilder({ data: null, error: null, count: 0 }),
      createMockQueryBuilder({ data: { id: "vouch-ns" }, error: null }),
    ];
    tableBuilders.candidates = [
      createMockQueryBuilder({ data: { phone: "919811122233" }, error: null }),
    ];

    const { handleVouchResponse } = await import("@/lib/agents/vouch");
    await handleVouchResponse("919900006666", "3", "vouch_q5", {
      candidate_id: "cand-ns",
      candidate_name: "Dana",
      vouch_data: {
        relationship_type: "peer",
        duration: "1_2y",
        skills_vouched: ["Execution"],
        standout_sentence: "Shipped four critical migrations under deadline.",
      },
    });

    expect(mockLoggerInfo).not.toHaveBeenCalledWith(
      "metric.vouch_flow_declined",
      expect.anything(),
    );
  });
});

describe("handleVouchResponse — Q3 multi-select robustness", () => {
  it("re-asks Q3 when no recognizable numbers are sent (no garbage saved)", async () => {
    const { handleVouchResponse } = await import("@/lib/agents/vouch");
    await handleVouchResponse("919900007777", "I dunno really", "vouch_q3", {
      candidate_id: "cand-q3",
      candidate_name: "Eve",
      vouch_data: { relationship_type: "peer", duration: "1_2y" },
    });

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919900007777",
      expect.stringContaining("Sorry, I didn't catch that"),
    );
    // Session must NOT advance to vouch_q4
    const advanced = mockUpdateSession.mock.calls.find((call: unknown[]) => call[1] === "vouch_q4");
    expect(advanced).toBeUndefined();
  });

  it("accepts space-separated numbers and echoes the chosen skills before Q4", async () => {
    const { handleVouchResponse } = await import("@/lib/agents/vouch");
    await handleVouchResponse("919900008888", "1 3", "vouch_q3", {
      candidate_id: "cand-q3b",
      candidate_name: "Frank",
      vouch_data: { relationship_type: "peer", duration: "1_2y" },
    });

    const q4Send = mockSendWhatsAppMessage.mock.calls.find((call: unknown[]) =>
      String(call[1] ?? "").includes("In one sentence"),
    );
    expect(q4Send).toBeDefined();
    expect(String(q4Send?.[1] ?? "")).toContain("Got it: Technical skills, Execution");

    expect(mockUpdateSession).toHaveBeenCalledWith(
      "919900008888",
      "vouch_q4",
      expect.objectContaining({
        vouch_data: expect.objectContaining({
          skills_vouched: ["Technical skills", "Execution"],
        }),
      }),
    );
  });
});

describe("handleVouchResponse — Q5 restores prior_session for dual-state vouchers", () => {
  it("restores the voucher's prior candidate state instead of dropping to 'complete'", async () => {
    tableBuilders.vouches = [
      createMockQueryBuilder({ data: null, error: null }),
      createMockQueryBuilder({ data: null, error: null }),
      createMockQueryBuilder({ data: null, error: null, count: 0 }),
      createMockQueryBuilder({ data: { id: "vouch-prior" }, error: null }),
    ];
    tableBuilders.candidates = [
      createMockQueryBuilder({ data: { phone: "919811199999" }, error: null }),
    ];

    const { handleVouchResponse } = await import("@/lib/agents/vouch");
    await handleVouchResponse("919900009999", "1", "vouch_q5", {
      candidate_id: "cand-restore",
      candidate_name: "Greta",
      prior_session: {
        state: "scored",
        context: { active_match_job_id: "job-77" },
      },
      vouch_data: {
        relationship_type: "managed",
        duration: "2y_plus",
        skills_vouched: ["Leadership"],
        standout_sentence: "Doubled team velocity and on-call clarity in two quarters.",
      },
    });

    // Final session must be the prior state, not "complete".
    const restoredCall = mockUpdateSession.mock.calls.find(
      (call: unknown[]) => call[0] === "919900009999" && call[1] === "scored",
    );
    expect(restoredCall).toBeDefined();
    expect(restoredCall?.[2]).toEqual({ active_match_job_id: "job-77" });
    expect(mockUpdateSession).not.toHaveBeenCalledWith("919900009999", "complete", {});
  });
});

describe("saveVouch — social proof to candidate", () => {
  it("sends a social-proof note to the candidate after trust score recalculation", async () => {
    mockRecalculateTrustScore.mockResolvedValueOnce(82);
    tableBuilders.vouches = [
      createMockQueryBuilder({ data: null, error: null }),
      createMockQueryBuilder({ data: null, error: null }),
      createMockQueryBuilder({ data: null, error: null, count: 0 }),
      createMockQueryBuilder({ data: { id: "vouch-sp" }, error: null }),
    ];
    tableBuilders.candidates = [
      createMockQueryBuilder({ data: { phone: "919812345678" }, error: null }),
    ];

    const { handleVouchResponse } = await import("@/lib/agents/vouch");
    await handleVouchResponse("919900012222", "1", "vouch_q5", {
      candidate_id: "cand-sp",
      candidate_name: "Hank",
      vouch_data: {
        relationship_type: "peer",
        duration: "1_2y",
        skills_vouched: ["Execution"],
        standout_sentence: "Shipped a billing migration in 6 weeks with zero downtime.",
      },
    });

    const proofCall = mockSendWhatsAppMessage.mock.calls.find((call: unknown[]) =>
      String(call[1] ?? "").includes("vouched for you"),
    );
    expect(proofCall).toBeDefined();
    expect(proofCall?.[0]).toBe("919812345678");
    expect(String(proofCall?.[1] ?? "")).toContain("82/100");

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "metric.vouch_social_proof_sent",
      expect.objectContaining({ candidate_id: "cand-sp", trust_score: 82 }),
    );
  });
});
