import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAdmin = { from: vi.fn() };
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockAdmin,
}));

/**
 * A query builder whose `.range(from, to)` resolves the corresponding slice of a
 * fixture array — so fetchAllSupabasePages walks real page boundaries. Every other
 * method is chainable and inert.
 */
function pagedBuilder(rows: Array<Record<string, unknown>>) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ["select", "gte", "lt", "eq", "is", "not", "order"]) {
    builder[m] = vi.fn(chain);
  }
  builder.range = vi.fn((from: number, to: number) =>
    Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
  );
  return builder;
}

describe("costs query pagination (does not truncate at one PostgREST page)", () => {
  beforeEach(() => {
    mockAdmin.from.mockReset();
  });

  it("getCostSummary sums every event across pages, not just the first ~page", async () => {
    // 900 rows > ANALYTICS_PAGE_SIZE (800): a single un-paginated query would drop
    // the last 100 and under-count. Each contributes $1.
    const rows = Array.from({ length: 900 }, () => ({ amount_usd: 1, status: "estimated" }));
    mockAdmin.from.mockReturnValue(pagedBuilder(rows));

    const { getCostSummary } = await import("@/lib/costs/query");
    const result = await getCostSummary({ fromIso: "2026-01-01", toIso: "2026-02-01" });

    expect(result.eventsCount).toBe(900);
    expect(result.totalUsd).toBe(900);
    expect(result.estimatedUsd).toBe(900);
  });

  it("getCostByProvider aggregates across pages", async () => {
    const rows = [
      ...Array.from({ length: 800 }, () => ({ provider: "anthropic", amount_usd: 1 })),
      ...Array.from({ length: 50 }, () => ({ provider: "openai", amount_usd: 2 })),
    ];
    mockAdmin.from.mockReturnValue(pagedBuilder(rows));

    const { getCostByProvider } = await import("@/lib/costs/query");
    const result = await getCostByProvider({ fromIso: "2026-01-01", toIso: "2026-02-01" });

    const anthropic = result.find((r) => r.provider === "anthropic");
    const openai = result.find((r) => r.provider === "openai");
    expect(anthropic).toEqual({ provider: "anthropic", totalUsd: 800, eventsCount: 800 });
    expect(openai).toEqual({ provider: "openai", totalUsd: 100, eventsCount: 50 });
  });
});
