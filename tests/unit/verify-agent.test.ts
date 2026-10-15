import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockIsEnabled = vi.fn();
const mockCallClaude = vi.fn();
const mockLoggerInfo = vi.fn();

const tableBuilders: Record<string, ReturnType<typeof createMockQueryBuilder>> = {};

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: (...args: unknown[]) => mockIsEnabled(...args),
}));

vi.mock("@/lib/services/anthropic", () => ({
  callClaude: (...args: unknown[]) => mockCallClaude(...args),
  extractJsonArray: () => [
    { company: "Acme", title: "Engineer", start_date: "2021-01", end_date: "2023-01" },
  ],
  extractJsonObject: () => ({ consistent: true, issues: [] }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => tableBuilders[table] ?? createMockQueryBuilder(),
  }),
}));

vi.mock("@/lib/agents/trust-score", () => ({
  recalculateTrustScore: vi.fn().mockResolvedValue(40),
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

describe("triggerVerifyAgent", () => {
  beforeEach(() => {
    mockIsEnabled.mockReset();
    mockCallClaude.mockReset();
    mockLoggerInfo.mockReset();
    process.env.VERIFY_MAX_CLAUDE_CALLS_PER_CANDIDATE = "2";
    process.env.VERIFY_MAX_CLAUDE_TOKENS_PER_CANDIDATE = "2500";
    for (const k of Object.keys(tableBuilders)) delete tableBuilders[k];
  });

  it("emits metric with disabled reason when verify flag is off", async () => {
    mockIsEnabled.mockResolvedValue(false);
    // Production now resolves the candidate -> latest application -> job org BEFORE
    // calling isEnabled so the flag check can be org-scoped. Provide stub rows so we
    // reach the flag check rather than short-circuiting on candidate_not_found.
    tableBuilders.candidates = createMockQueryBuilder({
      data: { id: "cand-1", cv_raw_text: "sample cv", linkedin_url: null, github_url: null },
      error: null,
    });
    tableBuilders.applications = createMockQueryBuilder({ data: null, error: null });
    tableBuilders.jobs = createMockQueryBuilder({ data: null, error: null });

    const { triggerVerifyAgent } = await import("@/lib/agents/verify");
    await triggerVerifyAgent("cand-1");

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "metric.verify_invoked",
      expect.objectContaining({
        candidate_id: "cand-1",
        success: false,
        reason: "disabled",
        claude_calls: 0,
      }),
    );
  });

  it("emits budget_exceeded metric when verify budget is zero", async () => {
    mockIsEnabled.mockResolvedValue(true);
    process.env.VERIFY_MAX_CLAUDE_CALLS_PER_CANDIDATE = "0";
    tableBuilders.candidates = createMockQueryBuilder({
      data: { id: "cand-1", cv_raw_text: "sample cv", linkedin_url: null, github_url: null },
      error: null,
    });

    const { triggerVerifyAgent } = await import("@/lib/agents/verify");
    await triggerVerifyAgent("cand-1");

    expect(mockCallClaude).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "metric.verify_invoked",
      expect.objectContaining({
        candidate_id: "cand-1",
        success: false,
        reason: "budget_exceeded",
      }),
    );
  });
});
