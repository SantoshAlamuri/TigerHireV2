import { describe, expect, it, vi } from "vitest";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

vi.mock("@/lib/services/anthropic", () => ({
  enrichCandidateSignal: vi.fn(),
}));

vi.mock("@/lib/observability/metrics", () => ({
  logAgentRun: vi.fn(),
}));

function selectChain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => Promise.resolve(result));
  return builder;
}

describe("processUnprocessedSignals", () => {
  it("surfaces a signals query failure in ctx.errors instead of silently no-opping", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "signals") {
        return selectChain({
          data: null,
          error: { message: "column signals.status does not exist" },
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const { processUnprocessedSignals } = await import("@/lib/agents/talent-scout");
    const ctx = await processUnprocessedSignals(10);

    expect(ctx.errors).toEqual([
      "Failed to fetch raw signals: column signals.status does not exist",
    ]);
    expect(ctx.recordsProcessed).toBe(0);
  });

  it("returns an empty run when there are no raw signals", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "signals") return selectChain({ data: [], error: null });
      throw new Error(`unexpected table ${table}`);
    });

    const { processUnprocessedSignals } = await import("@/lib/agents/talent-scout");
    const ctx = await processUnprocessedSignals(10);

    expect(ctx.errors).toEqual([]);
    expect(ctx.recordsProcessed).toBe(0);
  });
});
