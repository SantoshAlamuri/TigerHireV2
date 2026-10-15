import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockCallClaude = vi.fn();
const mockIsEnabled = vi.fn();
const mockRpc = vi.fn();
const mockLoggerInfo = vi.fn();
const mockSendWhatsAppMessage = vi.fn();

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
  sendTemplateMessage: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/whatsapp/sessions", () => ({
  updateSession: vi.fn().mockResolvedValue(undefined),
  withSessionCAS: vi.fn().mockResolvedValue(null),
  SessionConflictError: class SessionConflictError extends Error {},
}));

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: (...args: unknown[]) => mockIsEnabled(...args),
}));

vi.mock("@/lib/agents/trust-score", () => ({
  recalculateTrustScore: vi.fn().mockResolvedValue(42),
}));

vi.mock("@/lib/observability/metrics", () => ({
  logAgentRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

async function submitQ5(phone: string, candidateId = "cand-1") {
  const { handleVouchResponse } = await import("@/lib/agents/vouch");
  await handleVouchResponse(phone, "1", "vouch_q5", {
    candidate_id: candidateId,
    candidate_name: "Alice",
    vouch_data: {
      relationship_type: "peer",
      duration: "1_2y",
      skills_vouched: ["Execution"],
      standout_sentence: "Built an internal hiring dashboard that cut SLA breaches by 32%.",
    },
  });
}

describe("vouch circular anti-gaming (pairwise + depth-3)", () => {
  beforeEach(() => {
    tableBuilders = {};
    mockCallClaude.mockReset();
    mockIsEnabled.mockReset();
    mockRpc.mockReset();
    mockLoggerInfo.mockReset();
    mockSendWhatsAppMessage.mockReset();

    mockCallClaude.mockResolvedValue({
      text: '{"specificity_score":80,"credibility_multiplier":1.0,"summary":"specific"}',
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    mockRpc.mockResolvedValue({ data: false, error: null });
    mockSendWhatsAppMessage.mockResolvedValue({ success: true });
    mockIsEnabled.mockImplementation(async (key: string) => {
      if (key === "vouch_agent") return true;
      if (key === "circular_vouch_depth_3") return true;
      return true;
    });
  });

  it("blocks existing pairwise cycle (A↔B) and emits bounded metric", async () => {
    tableBuilders.vouches = [
      createMockQueryBuilder({ data: null, error: null }), // duplicate
      createMockQueryBuilder({ data: { id: "reverse-1" }, error: null }), // reverse vouch
      createMockQueryBuilder({ data: { id: "pairwise-1" }, error: null }), // circular match
    ];
    tableBuilders.candidates = [
      createMockQueryBuilder({ data: { phone: "919811122233" }, error: null }), // target candidate
      createMockQueryBuilder({ data: { id: "cand-voucher" }, error: null }), // voucher has candidate row
    ];

    await submitQ5("919900001111");

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "metric.circular_vouch_blocked",
      expect.objectContaining({
        reason: "pairwise_cycle",
        depth: 2,
        candidate_id: "cand-1",
      }),
    );
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919900001111",
      "This vouch can't be accepted — mutual vouching isn't allowed.",
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("blocks depth-3 cycle (A→B→C→A) behind flag and emits bounded metric", async () => {
    tableBuilders.vouches = [
      createMockQueryBuilder({ data: null, error: null }), // duplicate
      createMockQueryBuilder({ data: null, error: null }), // reverse vouch
    ];
    tableBuilders.candidates = [
      createMockQueryBuilder({ data: { phone: "+91 98111 22233" }, error: null }), // candidate phone
    ];
    mockRpc.mockResolvedValue({ data: true, error: null });

    await submitQ5("+91 99000 01111");

    expect(mockRpc).toHaveBeenCalledWith("check_circular_vouch_depth_3", {
      p_new_voucher_phone: "919900001111",
      p_new_candidate_phone: "919811122233",
    });
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "metric.circular_vouch_blocked",
      expect.objectContaining({
        reason: "depth_3_cycle",
        depth: 3,
        candidate_id: "cand-1",
      }),
    );
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "+91 99000 01111",
      "This vouch can't be accepted — circular vouching isn't allowed.",
    );
  });

  it("allows non-cyclic chain (A→B→C without edge back to A)", async () => {
    const insertBuilder = createMockQueryBuilder({ data: { id: "vouch-1" }, error: null });
    tableBuilders.vouches = [
      createMockQueryBuilder({ data: null, error: null }), // duplicate
      createMockQueryBuilder({ data: null, error: null }), // reverse vouch
      createMockQueryBuilder({ data: null, error: null, count: 0 }), // rapid pattern
      insertBuilder, // insert
    ];
    tableBuilders.candidates = [
      createMockQueryBuilder({ data: { phone: "919811122233" }, error: null }),
    ];
    mockRpc.mockResolvedValue({ data: false, error: null });

    await submitQ5("919900001111");

    expect(insertBuilder.insert).toHaveBeenCalled();
    expect(mockLoggerInfo).not.toHaveBeenCalledWith(
      "metric.circular_vouch_blocked",
      expect.anything(),
    );
  });

  it("does not block depth-4 only cycle (scope remains depth-3 max)", async () => {
    const insertBuilder = createMockQueryBuilder({ data: { id: "vouch-2" }, error: null });
    tableBuilders.vouches = [
      createMockQueryBuilder({ data: null, error: null }), // duplicate
      createMockQueryBuilder({ data: null, error: null }), // reverse vouch
      createMockQueryBuilder({ data: null, error: null, count: 0 }), // rapid pattern
      insertBuilder, // insert
    ];
    tableBuilders.candidates = [
      createMockQueryBuilder({ data: { phone: "919811122233" }, error: null }),
    ];
    // Depth-4 graphs should not be blocked by depth-3 check.
    mockRpc.mockResolvedValue({ data: false, error: null });

    await submitQ5("919900001111");

    expect(insertBuilder.insert).toHaveBeenCalled();
  });

  it("keeps self-loop check as first blocker (A vouching for A)", async () => {
    tableBuilders.vouches = [
      createMockQueryBuilder({ data: null, error: null }), // duplicate
    ];
    tableBuilders.candidates = [
      createMockQueryBuilder({ data: { phone: "+91 99000 01111" }, error: null }),
    ];

    await submitQ5("919900001111");

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "919900001111",
      "You cannot vouch for yourself.",
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("normalizes phone variants at graph edges before depth-3 RPC", async () => {
    tableBuilders.vouches = [
      createMockQueryBuilder({ data: null, error: null }), // duplicate
      createMockQueryBuilder({ data: null, error: null }), // reverse vouch
    ];
    tableBuilders.candidates = [
      createMockQueryBuilder({ data: { phone: "+91 98765 43210" }, error: null }),
    ];
    mockRpc.mockResolvedValue({ data: true, error: null });

    await submitQ5("+919900001111");

    expect(mockRpc).toHaveBeenCalledWith("check_circular_vouch_depth_3", {
      p_new_voucher_phone: "919900001111",
      p_new_candidate_phone: "919876543210",
    });
  });
});
