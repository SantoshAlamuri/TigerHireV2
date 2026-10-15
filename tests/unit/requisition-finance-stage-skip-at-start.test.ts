import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const hasActiveApproverRole = vi.fn();
vi.mock("@/lib/workflows/requisition-approval-workflow/helpers", () => ({
  hasActiveApproverRole: (...args: unknown[]) => hasActiveApproverRole(...args),
  notifyActiveRequisitionApprovers: vi.fn(),
  buildInitialStagePlan: vi.fn(),
}));

import {
  planLeadingFinanceSkips,
  FINANCE_AUTO_SKIP_COMMENT,
} from "@/lib/workflows/requisition-approval-workflow/skip-unactionable-finance";

const admin = {} as SupabaseClient;
const BASE = { organisationId: "org-1", hiringRequestId: "req-1" };

const stage = (stageOrder: number, approverRole: string) => ({
  stageKey: `${approverRole}_${stageOrder}`,
  stageOrder,
  approverRole,
  slaHours: 8,
});

describe("planLeadingFinanceSkips", () => {
  beforeEach(() => {
    hasActiveApproverRole.mockReset();
  });

  it("skips a leading finance stage when the org has no finance approver", async () => {
    // The live case: a self-serve company signs up with one leadership user, no
    // finance seat, and its first requisition opens on finance.
    hasActiveApproverRole.mockResolvedValue(false);

    const plan = await planLeadingFinanceSkips(admin, {
      ...BASE,
      stagePlan: [stage(1, "finance"), stage(2, "leadership")],
    });

    expect([...plan.skippedOrders]).toEqual([1]);
    expect(plan.activeOrder).toBe(2);
  });

  it("leaves the chain alone when a finance approver exists", async () => {
    hasActiveApproverRole.mockResolvedValue(true);

    const plan = await planLeadingFinanceSkips(admin, {
      ...BASE,
      stagePlan: [stage(1, "finance"), stage(2, "leadership")],
    });

    expect(plan.skippedOrders.size).toBe(0);
    expect(plan.activeOrder).toBe(1);
  });

  it("does not look up an approver when the chain does not open on finance", async () => {
    const plan = await planLeadingFinanceSkips(admin, {
      ...BASE,
      stagePlan: [stage(1, "leadership"), stage(2, "finance")],
    });

    expect(hasActiveApproverRole).not.toHaveBeenCalled();
    expect(plan.skippedOrders.size).toBe(0);
    expect(plan.activeOrder).toBe(1);
  });

  it("skips several consecutive finance orders but stops at the first actionable one", async () => {
    hasActiveApproverRole.mockResolvedValue(false);

    const plan = await planLeadingFinanceSkips(admin, {
      ...BASE,
      stagePlan: [stage(1, "finance"), stage(2, "finance"), stage(3, "leadership")],
    });

    expect([...plan.skippedOrders].sort()).toEqual([1, 2]);
    expect(plan.activeOrder).toBe(3);
  });

  it("does NOT skip when every order is finance — approving a requisition with no human decision is worse than stalling", async () => {
    hasActiveApproverRole.mockResolvedValue(false);

    const plan = await planLeadingFinanceSkips(admin, {
      ...BASE,
      stagePlan: [stage(1, "finance"), stage(2, "finance")],
    });

    expect(plan.skippedOrders.size).toBe(0);
    expect(plan.activeOrder).toBe(1);
  });

  it("does not skip a mixed order that merely includes finance", async () => {
    const plan = await planLeadingFinanceSkips(admin, {
      ...BASE,
      stagePlan: [stage(1, "finance"), stage(1, "leadership"), stage(2, "leadership")],
    });

    expect(hasActiveApproverRole).not.toHaveBeenCalled();
    expect(plan.activeOrder).toBe(1);
  });

  it("keeps the chain when the approver lookup fails (hasActiveApproverRole fails open to true)", async () => {
    hasActiveApproverRole.mockResolvedValue(true);

    const plan = await planLeadingFinanceSkips(admin, {
      ...BASE,
      stagePlan: [stage(1, "finance"), stage(2, "leadership")],
    });

    expect(plan.skippedOrders.size).toBe(0);
  });

  it("exposes the same skip comment the post-decision skip writes", () => {
    expect(FINANCE_AUTO_SKIP_COMMENT).toBe("Auto-approved: no active finance approver configured");
  });
});
