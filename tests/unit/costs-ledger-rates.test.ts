import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpsert = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      upsert: (...args: unknown[]) => mockUpsert(...args),
    }),
  }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

import {
  calculateAnthropicUsdCost,
  coercePlatformCostExternalId,
  getAnthropicRate,
  recordAnthropicCostEvent,
  recordManualPlatformCost,
  serializeUnknownForLog,
} from "@/lib/costs/ledger";

describe("calculateAnthropicUsdCost — rate table", () => {
  beforeEach(() => {
    mockUpsert.mockReset();
    mockUpsert.mockResolvedValue({ error: null });
  });

  it("matches Sonnet 4 dated checkpoint to Sonnet 4 rates", () => {
    const rate = getAnthropicRate("claude-sonnet-4-20250514");
    expect(rate.input).toBe(0.003);
    expect(rate.output).toBe(0.015);
    expect(rate.cacheWrite).toBeCloseTo(0.00375, 6);
    expect(rate.cacheRead).toBeCloseTo(0.0003, 6);
  });

  it("matches Haiku 4.5 dated checkpoint to Haiku 4.5 rates", () => {
    const rate = getAnthropicRate("claude-haiku-4-5-20251001");
    expect(rate.input).toBe(0.001);
    expect(rate.output).toBe(0.005);
  });

  it("uses Opus 4 rates ($15/$75 per million) — NOT old Claude 3 Opus", () => {
    const rate = getAnthropicRate("claude-opus-4-20250514");
    expect(rate.input).toBe(0.015);
    expect(rate.output).toBe(0.075);
  });

  it("falls back to Sonnet rates for unknown models", () => {
    const rate = getAnthropicRate("claude-future-99");
    expect(rate.input).toBe(0.003);
    expect(rate.output).toBe(0.015);
  });

  it("computes uncached call cost correctly (Sonnet 4)", () => {
    const usd = calculateAnthropicUsdCost("claude-sonnet-4-20250514", {
      inputTokens: 273_244,
      outputTokens: 90_606,
    });
    expect(usd).toBeCloseTo((273_244 * 0.003) / 1000 + (90_606 * 0.015) / 1000, 6);
  });

  it("applies cache-read 10% discount and cache-write 1.25x premium", () => {
    const usd = calculateAnthropicUsdCost("claude-sonnet-4-20250514", {
      inputTokens: 1000,
      outputTokens: 0,
      cacheCreationInputTokens: 1000,
      cacheReadInputTokens: 1000,
    });
    expect(usd).toBeCloseTo(0.003 + 0.00375 + 0.0003, 6);
  });

  it("supports back-compat positional args (no cache tokens)", () => {
    const usd = calculateAnthropicUsdCost("claude-haiku-4-5-20251001", 1000, 1000);
    expect(usd).toBeCloseTo(0.001 + 0.005, 6);
  });

  it("ignores case and accepts hyphenated dated ids", () => {
    const usd = calculateAnthropicUsdCost("Claude-Sonnet-4-5-20260101", {
      inputTokens: 1000,
      outputTokens: 0,
    });
    expect(usd).toBeCloseTo(0.003, 6);
  });

  it("throws when manual cost persistence fails", async () => {
    mockUpsert.mockResolvedValue({ error: { message: "db unavailable" } });

    await expect(
      recordManualPlatformCost({
        provider: "meta",
        amountUsd: 123.45,
        periodKey: "2026-05",
      }),
    ).rejects.toThrow("db unavailable");
  });
});

describe("coercePlatformCostExternalId — ledger acceptance E", () => {
  it("falls back when value is [object Object]", () => {
    expect(coercePlatformCostExternalId("[object Object]", "anthropic:fallback")).toBe(
      "anthropic:fallback",
    );
  });

  it("falls back when substring looks stringified", () => {
    expect(
      coercePlatformCostExternalId("prefix [object Object] suffix", "anthropic:fallback"),
    ).toBe("anthropic:fallback");
  });

  it("accepts normal anthropic external ids", () => {
    const id = "anthropic:claude-sonnet-4-20250514:550e8400-e29b-41d4-a716-446655440000";
    expect(coercePlatformCostExternalId(id, "x")).toBe(id);
  });
});

describe("serializeUnknownForLog", () => {
  it("JSON-stringifies object errors (not [object Object])", () => {
    const s = serializeUnknownForLog({ message: "duplicate", code: "23505" });
    expect(s).toContain("23505");
    expect(s).toContain("duplicate");
  });
});

describe("recordAnthropicCostEvent", () => {
  beforeEach(() => {
    mockUpsert.mockReset();
    mockUpsert.mockResolvedValue({ error: null });
  });

  it("writes external_id with slugified model and metadata.status ok", async () => {
    await recordAnthropicCostEvent({
      model: "claude-sonnet-4-20250514",
      inputTokens: 10,
      outputTokens: 5,
      cacheCreationInputTokens: 100,
      cacheReadInputTokens: 50,
      invocationId: "550e8400-e29b-41d4-a716-446655440000",
      label: "vision-fallback-resume",
      jobId: "job-1",
      candidateId: "cand-1",
    });
    expect(mockUpsert).toHaveBeenCalled();
    const row = mockUpsert.mock.calls[0][0] as {
      external_id: string;
      metadata: Record<string, unknown>;
    };
    expect(row.external_id).toBe(
      "anthropic:claude-sonnet-4-20250514:550e8400-e29b-41d4-a716-446655440000",
    );
    expect(row.metadata.status).toBe("ok");
    expect(row.metadata.cache_creation_input_tokens).toBe(100);
    expect(row.metadata.cache_read_input_tokens).toBe(50);
  });

  it("records error-class rows with zero usage when provided", async () => {
    await recordAnthropicCostEvent({
      model: "claude-haiku-4-5-20251001",
      inputTokens: 0,
      outputTokens: 0,
      invocationId: "660e8400-e29b-41d4-a716-446655440001",
      callStatus: "error",
      errorClass: "APIConnectionError",
      label: "fitscore-hybrid-extraction",
    });
    const row = mockUpsert.mock.calls[0][0] as {
      metadata: Record<string, unknown>;
      amount_usd: number;
    };
    expect(row.amount_usd).toBe(0);
    expect(row.metadata.status).toBe("error");
    expect(row.metadata.error_class).toBe("APIConnectionError");
  });
});
