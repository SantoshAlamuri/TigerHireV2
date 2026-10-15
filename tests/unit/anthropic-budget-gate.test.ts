import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(),
}));
vi.mock("@/lib/observability/alerts", () => ({
  sendOpsAlert: vi.fn().mockResolvedValue(undefined),
}));

import {
  assertWithinAnthropicBudget,
  BudgetExceededError,
  invalidateBudgetSnapshotCache,
  recordAnthropicCallSpend,
  roleCapInr,
  usdToInr,
} from "@/lib/services/anthropic-budget-gate";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendOpsAlert } from "@/lib/observability/alerts";

const createSupabaseAdminMock = vi.mocked(createSupabaseAdmin);
const sendOpsAlertMock = vi.mocked(sendOpsAlert);

/**
 * Build a mock admin client. Per-role reads hit job_budget_state; global reads
 * hit budget_state. Each returns the configured spend.
 */
function makeClient(opts: {
  roleSpendInr?: number;
  roleCapInr?: number | null;
  roleWarnSent?: boolean;
  daySpendInr?: number;
  monthSpendInr?: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  return {
    from(table: string) {
      if (table === "job_budget_state") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    spend_inr_paise: Math.round((opts.roleSpendInr ?? 0) * 100),
                    cap_inr_paise:
                      opts.roleCapInr != null ? Math.round(opts.roleCapInr * 100) : null,
                  },
                  error: null,
                }),
            }),
          }),
          update: () => ({
            eq: () => ({
              is: () => ({
                select: () =>
                  Promise.resolve({
                    data: opts.roleWarnSent ? [] : [{ job_id: "job-1" }],
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      if (table === "budget_state") {
        return {
          select: () => ({
            in: () => ({
              in: () =>
                Promise.resolve({
                  data: [
                    {
                      window_kind: "day",
                      window_start_utc: today,
                      spend_inr_paise: Math.round((opts.daySpendInr ?? 0) * 100),
                    },
                    {
                      window_kind: "month",
                      window_start_utc: monthStart,
                      spend_inr_paise: Math.round((opts.monthSpendInr ?? 0) * 100),
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  } as unknown as ReturnType<typeof createSupabaseAdmin>;
}

beforeEach(() => {
  invalidateBudgetSnapshotCache();
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_BUDGET_GATE_DISABLED;
  delete process.env.ANTHROPIC_GLOBAL_CAP_DISABLED;
  process.env.ANTHROPIC_ROLE_CAP_INR = "3500";
  process.env.ANTHROPIC_DAILY_CAP_INR = "10000";
  process.env.ANTHROPIC_MONTHLY_CAP_INR = "100000";
  process.env.ANTHROPIC_WARN_AT_PCT = "80";
});

describe("BudgetExceededError", () => {
  it("carries window + cap + spent + jobId", () => {
    const err = new BudgetExceededError("role", 3500, 3600, "job-1");
    expect(err.window).toBe("role");
    expect(err.capInr).toBe(3500);
    expect(err.spentInr).toBe(3600);
    expect(err.jobId).toBe("job-1");
  });
});

describe("per-role cap (primary)", () => {
  it("passes when role under cap", async () => {
    createSupabaseAdminMock.mockReturnValue(makeClient({ roleSpendInr: 1000 }));
    await expect(assertWithinAnthropicBudget({ jobId: "job-1" })).resolves.toBeUndefined();
  });

  it("throws role BudgetExceededError when role cap met", async () => {
    createSupabaseAdminMock.mockReturnValue(makeClient({ roleSpendInr: 3500 }));
    await expect(assertWithinAnthropicBudget({ jobId: "job-1" })).rejects.toMatchObject({
      window: "role",
      jobId: "job-1",
    });
  });

  it("uses per-row cap override when present", async () => {
    createSupabaseAdminMock.mockReturnValue(makeClient({ roleSpendInr: 1600, roleCapInr: 1500 }));
    await expect(assertWithinAnthropicBudget({ jobId: "job-1" })).rejects.toMatchObject({
      window: "role",
      capInr: 1500,
    });
  });

  it("sends role warn alert at threshold (once)", async () => {
    createSupabaseAdminMock.mockReturnValue(makeClient({ roleSpendInr: 2900 })); // >80% of 3500
    await assertWithinAnthropicBudget({ jobId: "job-1" });
    expect(sendOpsAlertMock).toHaveBeenCalledTimes(1);
    expect(sendOpsAlertMock.mock.calls[0][0]).toContain("job-1");
  });

  it("does not re-alert when warn already sent (claim returns no rows)", async () => {
    createSupabaseAdminMock.mockReturnValue(makeClient({ roleSpendInr: 2900, roleWarnSent: true }));
    await assertWithinAnthropicBudget({ jobId: "job-1" });
    expect(sendOpsAlertMock).not.toHaveBeenCalled();
  });

  it("skips per-role check when no jobId given", async () => {
    createSupabaseAdminMock.mockReturnValue(makeClient({ daySpendInr: 0 }));
    await expect(assertWithinAnthropicBudget({})).resolves.toBeUndefined();
  });
});

describe("global backstop (secondary)", () => {
  it("throws day window when daily cap met even if role is fine", async () => {
    createSupabaseAdminMock.mockReturnValue(makeClient({ roleSpendInr: 100, daySpendInr: 10000 }));
    await expect(assertWithinAnthropicBudget({ jobId: "job-1" })).rejects.toMatchObject({
      window: "day",
    });
  });

  it("throws month window when monthly cap met", async () => {
    createSupabaseAdminMock.mockReturnValue(
      makeClient({ roleSpendInr: 100, monthSpendInr: 100000 }),
    );
    await expect(assertWithinAnthropicBudget({ jobId: "job-1" })).rejects.toMatchObject({
      window: "month",
    });
  });

  it("ignores global cap when ANTHROPIC_GLOBAL_CAP_DISABLED=true", async () => {
    process.env.ANTHROPIC_GLOBAL_CAP_DISABLED = "true";
    createSupabaseAdminMock.mockReturnValue(makeClient({ roleSpendInr: 100, daySpendInr: 999999 }));
    await expect(assertWithinAnthropicBudget({ jobId: "job-1" })).resolves.toBeUndefined();
  });
});

describe("disable + fail-open", () => {
  it("bypasses everything when ANTHROPIC_BUDGET_GATE_DISABLED=true", async () => {
    process.env.ANTHROPIC_BUDGET_GATE_DISABLED = "true";
    createSupabaseAdminMock.mockReturnValue(
      makeClient({ roleSpendInr: 999999, daySpendInr: 999999 }),
    );
    await expect(assertWithinAnthropicBudget({ jobId: "job-1" })).resolves.toBeUndefined();
    expect(createSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("fails open on role DB error", async () => {
    createSupabaseAdminMock.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: { message: "boom" } }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createSupabaseAdmin>);
    process.env.ANTHROPIC_GLOBAL_CAP_DISABLED = "true";
    await expect(assertWithinAnthropicBudget({ jobId: "job-1" })).resolves.toBeUndefined();
  });
});

describe("recordAnthropicCallSpend", () => {
  it("noop on zero/negative cost", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    createSupabaseAdminMock.mockReturnValue({ rpc } as unknown as ReturnType<
      typeof createSupabaseAdmin
    >);
    await recordAnthropicCallSpend({ costUsd: 0, jobId: "job-1" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("records per-role AND global when jobId present", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    createSupabaseAdminMock.mockReturnValue({ rpc } as unknown as ReturnType<
      typeof createSupabaseAdmin
    >);
    await recordAnthropicCallSpend({ costUsd: 0.015, jobId: "job-1", organisationId: "org-1" });
    expect(rpc).toHaveBeenCalledWith("record_job_anthropic_spend", {
      p_job_id: "job-1",
      p_organisation_id: "org-1",
      p_cost_inr_paise: Math.round(0.015 * usdToInr() * 100),
      p_cost_usd_micros: 15_000,
    });
    expect(rpc).toHaveBeenCalledWith("record_anthropic_spend", {
      p_cost_inr_paise: Math.round(0.015 * usdToInr() * 100),
      p_cost_usd_micros: 15_000,
    });
  });

  it("records only global when no jobId", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    createSupabaseAdminMock.mockReturnValue({ rpc } as unknown as ReturnType<
      typeof createSupabaseAdmin
    >);
    await recordAnthropicCallSpend({ costUsd: 0.01 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("record_anthropic_spend", expect.any(Object));
  });
});

describe("roleCapInr env resolution", () => {
  it("reads ANTHROPIC_ROLE_CAP_INR", () => {
    process.env.ANTHROPIC_ROLE_CAP_INR = "1500";
    expect(roleCapInr()).toBe(1500);
  });
  it("falls back to default on invalid", () => {
    process.env.ANTHROPIC_ROLE_CAP_INR = "not-a-number";
    expect(roleCapInr()).toBe(3500);
  });
});
