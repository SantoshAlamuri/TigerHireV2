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
  extractJsonObject: () => ({ riskScore: 20, flags: [], summary: "Looks clean" }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => tableBuilders[table] ?? createMockQueryBuilder(),
  }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("runGhostbuster", () => {
  beforeEach(() => {
    mockIsEnabled.mockReset();
    mockCallClaude.mockReset();
    mockLoggerInfo.mockReset();
    process.env.GHOSTBUSTER_MAX_CLAUDE_CALLS_PER_CANDIDATE = "1";
    process.env.GHOSTBUSTER_MAX_CLAUDE_TOKENS_PER_CANDIDATE = "2000";
    for (const k of Object.keys(tableBuilders)) delete tableBuilders[k];
  });

  it("emits disabled metric and returns benign result when flag is off", async () => {
    mockIsEnabled.mockResolvedValue(false);
    tableBuilders.candidates = createMockQueryBuilder({
      data: { id: "cand-1", cv_raw_text: "Resume text", name: "Alice" },
      error: null,
    });
    tableBuilders.applications = createMockQueryBuilder({ data: null, error: null });
    tableBuilders.jobs = createMockQueryBuilder({ data: null, error: null });

    const { runGhostbuster } = await import("@/lib/agents/ghostbuster-authenticity");
    const result = await runGhostbuster("cand-1");

    expect(result.summary).toContain("disabled");
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "metric.ghostbuster_invoked",
      expect.objectContaining({
        candidate_id: "cand-1",
        success: false,
        reason: "disabled",
      }),
    );
  });

  it("emits budget_exceeded metric when Candidate Authenticity Check budget is zero", async () => {
    mockIsEnabled.mockResolvedValue(true);
    process.env.GHOSTBUSTER_MAX_CLAUDE_CALLS_PER_CANDIDATE = "0";
    tableBuilders.candidates = createMockQueryBuilder({
      data: { id: "cand-1", cv_raw_text: "Resume text", name: "Alice" },
      error: null,
    });
    tableBuilders.applications = createMockQueryBuilder({ data: null, error: null });
    tableBuilders.jobs = createMockQueryBuilder({ data: null, error: null });

    const { runGhostbuster } = await import("@/lib/agents/ghostbuster-authenticity");
    const result = await runGhostbuster("cand-1");

    expect(result.summary).toContain("budget");
    expect(mockCallClaude).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "metric.ghostbuster_invoked",
      expect.objectContaining({
        candidate_id: "cand-1",
        success: false,
        reason: "budget_exceeded",
      }),
    );
  });
});
