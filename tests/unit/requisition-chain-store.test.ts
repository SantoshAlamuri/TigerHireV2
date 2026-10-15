import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { loadDefaultChain } from "@/lib/workflows/requisition-chain-store";
import { logger } from "@/lib/observability/logger";

/**
 * A stub of the two reads loadDefaultChain makes: the default chain row, then
 * its steps.
 */
function client(opts: {
  chain?: { id: string; name: string } | null;
  chainError?: string;
  steps?: Array<Record<string, unknown>> | null;
  stepsError?: string;
}) {
  return {
    from(table: string) {
      if (table === "requisition_approval_chains") {
        const b = {
          select: () => b,
          eq: () => b,
          maybeSingle: async () => ({
            data: opts.chain ?? null,
            error: opts.chainError ? { message: opts.chainError } : null,
          }),
        };
        return b;
      }
      const b = {
        select: () => b,
        eq: () => b,
        order: async () => ({
          data: opts.steps ?? [],
          error: opts.stepsError ? { message: opts.stepsError } : null,
        }),
      };
      return b;
    },
  } as any;
}

const STEP = {
  step_order: 1,
  approver_role: "leadership",
  sla_hours: 8,
  skip_when_raiser_role: ["leadership"],
  skip_when_budget_below: null,
};

describe("loading an organisation's approval chain", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the authored chain with its steps", async () => {
    const chain = await loadDefaultChain(
      client({ chain: { id: "c1", name: "HM to Admin" }, steps: [STEP] }),
      "org-1",
    );
    expect(chain).toEqual({
      id: "c1",
      name: "HM to Admin",
      steps: [
        {
          stepOrder: 1,
          approverRole: "leadership",
          slaHours: 8,
          skipWhenRaiserRole: ["leadership"],
          skipWhenBudgetBelow: null,
        },
      ],
    });
  });

  /**
   * Every one of these returns null, which means "keep using the preset you are
   * already running on". Inventing a default here would silently change who
   * approves an organisation's requisitions — the one thing an approval control
   * must never do quietly.
   */
  it("returns null when the org has authored nothing", async () => {
    expect(await loadDefaultChain(client({ chain: null }), "org-1")).toBeNull();
  });

  it("falls back, loudly, when the chain lookup fails", async () => {
    expect(await loadDefaultChain(client({ chainError: "boom" }), "org-1")).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("falling back to the preset chain"),
      expect.objectContaining({ organisationId: "org-1" }),
    );
  });

  it("falls back, loudly, when the steps fail to load", async () => {
    const out = await loadDefaultChain(
      client({ chain: { id: "c1", name: "X" }, stepsError: "boom" }),
      "org-1",
    );
    expect(out).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("treats a chain with no steps as a half-finished edit, not as approve-on-sight", async () => {
    // Approving everything is a legitimate policy, but it has to be authored
    // deliberately. An empty chain row is far more likely to be someone who
    // saved before adding a step.
    const out = await loadDefaultChain(
      client({ chain: { id: "c1", name: "X" }, steps: [] }),
      "org-1",
    );
    expect(out).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("no steps"),
      expect.objectContaining({ chainId: "c1" }),
    );
  });

  it("defaults a missing SLA rather than producing NaN hours", async () => {
    const chain = await loadDefaultChain(
      client({
        chain: { id: "c1", name: "X" },
        steps: [{ step_order: 1, approver_role: "recruiter", sla_hours: null }],
      }),
      "org-1",
    );
    expect(chain?.steps[0].slaHours).toBe(8);
    expect(chain?.steps[0].skipWhenRaiserRole).toEqual([]);
  });
});
