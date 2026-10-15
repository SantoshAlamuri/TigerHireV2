import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { getRequisitionApprovalWorkflowDefinition } from "@/lib/workflows/requisition-approval-definitions";
import type { RequisitionDecisionSuccess, WorkflowInstanceRow, WorkflowStageRow } from "./types";
import { hasActiveApproverRole, notifyActiveRequisitionApprovers } from "./helpers";
import { notifyRequisitionRequester } from "./notify-approvers";

/**
 * After the current stage was approved and its order fully cleared, advance the workflow to
 * the next order (activating its stages and notifying approvers), auto-skipping an
 * un-actionable finance-only order while preserving the rest of the chain, or completing the
 * instance when there is no further order.
 */
export async function advanceRequisitionAfterApproval(
  admin: SupabaseClient,
  params: {
    instance: WorkflowInstanceRow;
    hiringRequestId: string;
    orders: number[];
    currentOrder: number;
    refreshed: WorkflowStageRow[];
    roleMatchedStageId: string;
    nowIso: string;
  },
): Promise<RequisitionDecisionSuccess> {
  const { instance, orders, currentOrder, refreshed, roleMatchedStageId, nowIso } = params;

  const nextOrder = orders.find((o) => o > currentOrder);
  if (nextOrder == null) {
    await admin
      .from("workflow_instances")
      .update({ status: "completed", updated_at: nowIso })
      .eq("id", instance.id as string);
    await notifyRequisitionRequester(admin, {
      hiringRequestId: params.hiringRequestId,
      outcome: "approved",
    });
    return {
      ok: true,
      instanceId: instance.id as string,
      stageId: roleMatchedStageId,
      workflowStatus: "completed",
      nextActiveRoles: [],
    };
  }

  const def = getRequisitionApprovalWorkflowDefinition((instance.definition_key as string) || "");
  const nextGroup = refreshed.filter((s) => Number(s.stage_order) === nextOrder);
  const nextRoles = [
    ...new Set(nextGroup.map((s) => String(s.approver_role ?? "")).filter(Boolean)),
  ];
  const financeOnlyNextStage =
    nextRoles.length > 0 && nextRoles.every((role) => role === "finance");
  if (financeOnlyNextStage) {
    const hasFinanceApprover = await hasActiveApproverRole(admin, {
      organisationId: instance.organisation_id as string,
      role: "finance",
    });
    if (!hasFinanceApprover) {
      // Auto-skip only the un-actionable finance stage(s).
      for (const stage of nextGroup) {
        await admin
          .from("workflow_stages")
          .update({
            status: "approved",
            decision: "approved",
            comments: "Auto-approved: no active finance approver configured",
            decided_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", stage.id);
      }
      logger.info("decideRequisitionApprovalStage: auto-skipped finance stage (no approver)", {
        hiringRequestId: params.hiringRequestId,
        instanceId: instance.id,
      });

      // Advance to the order AFTER finance (e.g. Admin) so admin sign-off is
      // preserved — skipping finance must not skip the rest of the chain
      // ("keep Finance→Admin"). Only complete if finance was the last order.
      const orderAfterFinance = orders.find((o) => o > nextOrder);
      if (orderAfterFinance == null) {
        await admin
          .from("workflow_instances")
          .update({ status: "completed", updated_at: nowIso })
          .eq("id", instance.id as string);
        return {
          ok: true,
          instanceId: instance.id as string,
          stageId: roleMatchedStageId,
          workflowStatus: "completed",
          nextActiveRoles: [],
        };
      }
      const afterGroup = refreshed.filter((s) => Number(s.stage_order) === orderAfterFinance);
      for (const stage of afterGroup) {
        const stageHours = def.stages.find((d) => d.stageKey === stage.stage_key)?.slaHours ?? 8;
        await admin
          .from("workflow_stages")
          .update({
            status: "active",
            sla_due_at: new Date(Date.now() + stageHours * 3600 * 1000).toISOString(),
            updated_at: nowIso,
          })
          .eq("id", stage.id);
      }
      await notifyActiveRequisitionApprovers(admin, {
        organisationId: instance.organisation_id as string,
        hiringRequestId: params.hiringRequestId,
        requestTitle: "Hiring request",
        stageRoles: afterGroup.map((s) => String(s.approver_role ?? "")).filter(Boolean),
      });
      return {
        ok: true,
        instanceId: instance.id as string,
        stageId: roleMatchedStageId,
        workflowStatus: "active",
        nextActiveRoles: afterGroup.map((s) => s.approver_role || "unknown"),
      };
    }
  }

  for (const stage of nextGroup) {
    const stageHours = def.stages.find((d) => d.stageKey === stage.stage_key)?.slaHours ?? 8;
    await admin
      .from("workflow_stages")
      .update({
        status: "active",
        sla_due_at: new Date(Date.now() + stageHours * 3600 * 1000).toISOString(),
        updated_at: nowIso,
      })
      .eq("id", stage.id);
  }

  await notifyActiveRequisitionApprovers(admin, {
    organisationId: instance.organisation_id as string,
    hiringRequestId: params.hiringRequestId,
    requestTitle: "Hiring request",
    stageRoles: nextGroup.map((s) => String(s.approver_role ?? "")).filter(Boolean),
  });

  return {
    ok: true,
    instanceId: instance.id as string,
    stageId: roleMatchedStageId,
    workflowStatus: "active",
    nextActiveRoles: nextGroup.map((s) => s.approver_role || "unknown"),
  };
}
