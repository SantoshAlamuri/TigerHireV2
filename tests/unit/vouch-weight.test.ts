import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockCallClaude = vi.fn();
const mockLoggerInfo = vi.fn();

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
    summary: "Specific and concrete",
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => nextBuilder(table),
    rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
  }),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ success: true }),
  sendTemplateMessage: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/whatsapp/sessions", () => ({
  updateSession: vi.fn().mockResolvedValue(undefined),
  withSessionCAS: vi.fn().mockResolvedValue(null),
  SessionConflictError: class SessionConflictError extends Error {},
}));

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: vi.fn().mockResolvedValue(true),
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

describe("vouch weight updates", () => {
  beforeEach(() => {
    tableBuilders = {};
    mockCallClaude.mockReset();
    mockLoggerInfo.mockReset();
    mockCallClaude.mockResolvedValue({
      text: '{"specificity_score":80,"credibility_multiplier":1.0,"summary":"specific"}',
      usage: { input_tokens: 100, output_tokens: 20 },
    });
  });

  it("applies rehire intent ordering in calculateVouchWeight", async () => {
    const { calculateVouchWeight } = await import("@/lib/agents/vouch");
    const baseArgs = ["peer", "under_6m", 60] as const;
    const wYesDef = calculateVouchWeight(...baseArgs, "yes_definitely", 1.0);
    const wYesRole = calculateVouchWeight(...baseArgs, "yes_right_role", 1.0);
    const wNotSure = calculateVouchWeight(...baseArgs, "not_sure", 1.0);
    expect(wYesDef).toBeGreaterThan(wYesRole);
    expect(wYesRole).toBeGreaterThan(wNotSure);
    expect(wNotSure).toBeGreaterThanOrEqual(0);
  });

  it("emits vouch weight delta metric on changed weighting", async () => {
    tableBuilders.vouches = [
      createMockQueryBuilder({ data: null, error: null }), // duplicate check
      createMockQueryBuilder({ data: null, error: null }), // reverse vouch
      createMockQueryBuilder({ data: null, error: null, count: 0 }), // rapid pattern count
      createMockQueryBuilder({ data: { id: "vouch-1" }, error: null }), // insert
    ];
    tableBuilders.candidates = [
      createMockQueryBuilder({ data: { phone: "919988776655" }, error: null }),
    ];

    const { handleVouchResponse } = await import("@/lib/agents/vouch");
    await handleVouchResponse("919900001111", "1", "vouch_q5", {
      candidate_id: "cand-1",
      candidate_name: "Alice",
      vouch_data: {
        relationship_type: "client",
        duration: "under_6m",
        skills_vouched: ["Technical skills"],
        standout_sentence:
          "She led migration of 12 services, cut p95 latency 37%, and mentored 4 engineers.",
      },
    });

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "metric.vouch_weight_calculated_delta",
      expect.objectContaining({
        vouch_id: "vouch-1",
        candidate_id: "cand-1",
        rehire_intent: "yes_definitely",
      }),
    );
  });
});
