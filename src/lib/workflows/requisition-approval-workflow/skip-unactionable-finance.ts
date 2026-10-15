import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { hasActiveApproverRole } from "./helpers";
import type { StagePlanRow } from "./types";

/** Written onto stages skipped because the org has nobody who can action them. */
export const FINANCE_AUTO_SKIP_COMMENT = "Auto-approved: no active finance approver configured";

export interface LeadingFinanceSkipPlan {
  /** Stage orders to insert pre-approved instead of active. */
  skippedOrders: Set<number>;
  /** The order to activate — the first one somebody can actually action. */
  activeOrder: number;
}

/**
 * Decide which leading finance stages to skip when the workflow is created.
 *
 * `advanceRequisitionAfterApproval` already skips an un-actionable finance-only
 * order, but only when advancing PAST a decision. The first order is created
 * active at submission, so that skip never ran for it: a chain that opens with
 * finance, in an org with no finance seat, sat at `under_review` forever with
 * nobody able to move it. That is every new self-serve company — signup creates
 * one leadership user and no finance seat — so their first requisition
 * deadlocked on submit.
 *
 * Only LEADING finance-only orders are skipped, and only while a later order
 * survives: skipping the whole chain would approve a requisition with no human
 * decision at all, which is worse than the stall. That residual case (a
 * finance-only chain with no finance approver) keeps the old behaviour and logs
 * a distinct warning instead.
 */
export async function planLeadingFinanceSkips(
  admin: SupabaseClient,
  params: { organisationId: string; stagePlan: StagePlanRow[]; hiringRequestId: string },
): Promise<LeadingFinanceSkipPlan> {
  const orders = [...new Set(params.stagePlan.map((s) => s.stageOrder))].sort((a, b) => a - b);
  const firstOrder = orders[0] ?? 1;
  const empty: LeadingFinanceSkipPlan = { skippedOrders: new Set(), activeOrder: firstOrder };

  const rolesFor = (order: number) =>
    params.stagePlan.filter((s) => s.stageOrder === order).map((s) => String(s.approverRole ?? ""));

  const isFinanceOnly = (order: number) => {
    const roles = rolesFor(order).filter(Boolean);
    return roles.length > 0 && roles.every((role) => role === "finance");
  };

  if (!isFinanceOnly(firstOrder)) return empty;

  // Only pay for the lookup when the chain actually opens with finance.
  const hasFinanceApprover = await hasActiveApproverRole(admin, {
    organisationId: params.organisationId,
    role: "finance",
  });
  if (hasFinanceApprover) return empty;

  const skippedOrders = new Set<number>();
  let activeOrder: number | null = null;
  for (const order of orders) {
    if (isFinanceOnly(order)) {
      skippedOrders.add(order);
      continue;
    }
    activeOrder = order;
    break;
  }

  if (activeOrder == null) {
    // Every order was finance and none is actionable. Approving the whole
    // requisition unattended is not an improvement on stalling, so leave the
    // chain as-is and make the stall loud rather than silent.
    logger.warn("requisition workflow opens on an un-actionable finance-only chain", {
      event: "requisition_finance_chain_unactionable",
      hiringRequestId: params.hiringRequestId,
      organisationId: params.organisationId,
    });
    return empty;
  }

  logger.info("requisition workflow: skipped leading finance stage(s) with no approver", {
    event: "requisition_finance_stage_auto_skipped_at_start",
    hiringRequestId: params.hiringRequestId,
    organisationId: params.organisationId,
    skippedOrders: [...skippedOrders],
    activeOrder,
  });

  return { skippedOrders, activeOrder };
}
