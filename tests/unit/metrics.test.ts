import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    agent: vi.fn(),
  },
}));

vi.mock("@/lib/observability/alerts", () => ({
  sendCostAlert: vi.fn().mockResolvedValue(undefined),
}));

import {
  calculateClaudeCost,
  calculateEmbeddingCost,
  logAgentRun,
} from "@/lib/observability/metrics";
import { logger } from "@/lib/observability/logger";
import { sendCostAlert } from "@/lib/observability/alerts";

describe("calculateClaudeCost", () => {
  it("calculates cost for sonnet model", () => {
    const cost = calculateClaudeCost("claude-sonnet-4-20250514", 1000, 1000);
    // input: (1000/1000)*0.003 = 0.003, output: (1000/1000)*0.015 = 0.015
    // total USD = 0.018, INR = 0.018 * 84 = 1.512
    expect(cost).toBe(1.512);
  });

  it("calculates cost for haiku model", () => {
    const cost = calculateClaudeCost("claude-3-haiku", 1000, 1000);
    // input: 0.001, output: 0.005, total USD = 0.006, INR = 0.504
    expect(cost).toBe(0.504);
  });

  it("returns 0 for zero tokens", () => {
    const cost = calculateClaudeCost("claude-sonnet-4-20250514", 0, 0);
    expect(cost).toBe(0);
  });

  it("handles large token counts", () => {
    const cost = calculateClaudeCost("claude-sonnet-4-20250514", 100000, 50000);
    // input: 100*0.003=0.3, output: 50*0.015=0.75, USD=1.05, INR=88.2
    expect(cost).toBe(88.2);
  });

  it("uses Opus pricing for opus models", () => {
    const cost = calculateClaudeCost("claude-opus-4-20250514", 1000, 0);
    // input: 0.005 USD, INR = 0.42
    expect(cost).toBe(0.42);
  });

  it("uses Sonnet pricing for non-haiku non-opus models", () => {
    const cost = calculateClaudeCost("claude-sonnet-4-6", 1000, 0);
    expect(cost).toBe(0.252);
  });
});

describe("calculateEmbeddingCost", () => {
  it("calculates embedding cost in INR", () => {
    const cost = calculateEmbeddingCost(1000);
    // (1000/1000)*0.00002 = 0.00002 USD, INR = 0.00002*84 = 0.0017
    expect(cost).toBe(0.0017);
  });

  it("returns 0 for zero tokens", () => {
    expect(calculateEmbeddingCost(0)).toBe(0);
  });

  it("handles large embedding batches", () => {
    const cost = calculateEmbeddingCost(1000000);
    // 1000 * 0.00002 = 0.02 USD, INR = 1.68
    expect(cost).toBe(1.68);
  });
});

describe("logAgentRun", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let insertFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const builder = createMockQueryBuilder();
    insertFn = builder.insert as ReturnType<typeof vi.fn>;
    mockSupabase = createMockSupabase({ agent_logs: builder });
  });

  it("inserts an agent log row with cost", async () => {
    await logAgentRun(
      mockSupabase,
      "fitscore",
      "api",
      "job-1",
      "success",
      1500,
      undefined,
      { input: 1000, output: 500 },
      "claude-sonnet-4-20250514",
    );

    expect(mockSupabase.from).toHaveBeenCalledWith("agent_logs");
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_name: "fitscore",
        trigger_type: "api",
        input_ref: "job-1",
        status: "success",
        duration_ms: 1500,
      }),
    );
  });

  it("logs via logger.agent", async () => {
    await logAgentRun(mockSupabase, "scout", "cron", null, "success", 2000);

    expect(logger.agent).toHaveBeenCalledWith(
      "scout",
      expect.objectContaining({ duration_ms: 2000 }),
    );
  });

  it("records error message when provided", async () => {
    await logAgentRun(mockSupabase, "scout", "api", "ref-1", "error", 500, "timeout");

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        error_message: "timeout",
      }),
    );
  });

  it("sets cost to 0 when no tokens provided", async () => {
    await logAgentRun(mockSupabase, "scout", "api", null, "success", 100);

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        cost_inr: 0,
        tokens_used: 0,
      }),
    );
  });

  it("triggers cost alert when cost exceeds INR 50", async () => {
    await logAgentRun(
      mockSupabase,
      "fitscore",
      "batch",
      "job-big",
      "success",
      5000,
      undefined,
      { input: 100000, output: 100000 },
      "claude-sonnet-4-20250514",
    );

    expect(sendCostAlert).toHaveBeenCalled();
  });

  it("does not trigger cost alert when cost is below threshold", async () => {
    await logAgentRun(
      mockSupabase,
      "scout",
      "api",
      "job-1",
      "success",
      100,
      undefined,
      { input: 100, output: 100 },
      "claude-3-haiku",
    );

    expect(sendCostAlert).not.toHaveBeenCalled();
  });

  it("computes total tokens from input + output", async () => {
    await logAgentRun(
      mockSupabase,
      "fitscore",
      "api",
      null,
      "success",
      200,
      undefined,
      { input: 300, output: 700 },
      "claude-sonnet-4-20250514",
    );

    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ tokens_used: 1000 }));
  });
});
