import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import type { WorkflowStageRow } from "./types";
import { ACTIONABLE_STAGE_STATUSES, OPEN_STAGE_STATUSES } from "./types";
import {
  actorMayDecideRole,
  openStagesAtOrder,
  repairStuckRequisitionWorkflowStages,
  uniqueOrders,
} from "./helpers";
import { ensureActiveRequisitionWorkflowInstance } from "./start";
import { advanceRequisitionAfterApproval } from "./advance";
import { notifyRequisitionRequester } from "./notify-approvers";

export async function decideRequisitionApprovalStage(
  admin: SupabaseClient,
  params: {
    hiringRequestId: string;
    actorProfileId: string;
    decision: "approved" | "rejected";
    comment?: string | null;
  },
): Promise<
  | {
      ok: true;
      instanceId: string;
      stageId: string;
      workflowStatus: "active" | "completed" | "rejected";
      nextActiveRoles: string[];
    }
  | { ok: false; status: number; error: string }
> {
  const ensured = await ensureActiveRequisitionWorkflowInstance(admin, params.hiringRequestId);
  if (ensured.kind === "unavailable") {
    return { ok: false, status: ensured.status, error: ensured.error };
  }
  if (ensured.kind === "already_completed") {
    if (params.decision === "rejected") {
      return {
        ok: false,
        status: 409,
        error: "Approval workflow is already completed for this requisition",
      };
    }
    return {
      ok: true,
      instanceId: ensured.instanceId,
      stageId: ensured.instanceId,
      workflowStatus: "completed",
      nextActiveRoles: [],
    };
  }

  const instance = ensured.instance;

  const { data: stageRows } = await admin
    .from("workflow_stages")
    .select("id, stage_key, stage_order, approver_role, status")
    .eq("instance_id", instance.id as string)
    .order("stage_order", { ascending: true });
  let stages = (stageRows ?? []) as WorkflowStageRow[];
  if (!stages.length) {
    return { ok: false, status: 409, error: "Workflow stages are missing for this requisition" };
  }

  let orders = uniqueOrders(stages);
  let currentOrder = orders.find((order) =>
    openStagesAtOrder(stages, order).some((s) => ACTIONABLE_STAGE_STATUSES.has(s.status)),
  );
  if (currentOrder == null) {
    stages = await repairStuckRequisitionWorkflowStages(
      admin,
      {
        instanceId: instance.id as string,
        definitionKey: (instance.definition_key as string) || "",
      },
      stages,
    );
    orders = uniqueOrders(stages);
    currentOrder = orders.find((order) =>
      openStagesAtOrder(stages, order).some((s) => ACTIONABLE_STAGE_STATUSES.has(s.status)),
    );
  }
  if (currentOrder == null) {
    const allApproved = stages.every((s) => s.status === "approved");
    if (allApproved) {
      const nowIso = new Date().toISOString();
      await admin
        .from("workflow_instances")
        .update({ status: "completed", updated_at: nowIso })
        .eq("id", instance.id as string);
      logger.info("decideRequisitionApprovalStage: completed instance with all stages approved", {
        hiringRequestId: params.hiringRequestId,
        instanceId: instance.id,
      });
      return {
        ok: true,
        instanceId: instance.id as string,
        stageId: stages[stages.length - 1]?.id ?? "",
        workflowStatus: "completed",
        nextActiveRoles: [],
      };
    }
    return { ok: false, status: 409, error: "Workflow has no active stage" };
  }
  const currentGroup = openStagesAtOrder(stages, currentOrder);
  const roleMatchedStage = currentGroup.find((s) => ACTIONABLE_STAGE_STATUSES.has(s.status));
  if (!roleMatchedStage?.id) {
    return { ok: false, status: 409, error: "No active decision stage found" };
  }

  const mayDecide = await actorMayDecideRole(admin, {
    organisationId: instance.organisation_id as string,
    actorProfileId: params.actorProfileId,
    requiredRole: roleMatchedStage.approver_role,
  });
  if (!mayDecide) {
    return { ok: false, status: 403, error: "You are not authorized for this approval stage" };
  }

  const nowIso = new Date().toISOString();
  const stageStatus = params.decision === "approved" ? "approved" : "rejected";
  await admin
    .from("workflow_stages")
    .update({
      status: stageStatus,
      decision: params.decision,
      comments: params.comment ?? null,
      decided_by: params.actorProfileId,
      decided_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", roleMatchedStage.id);

  if (params.decision === "rejected") {
    await admin
      .from("workflow_instances")
      .update({ status: "cancelled", updated_at: nowIso })
      .eq("id", instance.id as string);
    await notifyRequisitionRequester(admin, {
      hiringRequestId: params.hiringRequestId,
      outcome: "rejected",
    });
    return {
      ok: true,
      instanceId: instance.id as string,
      stageId: roleMatchedStage.id,
      workflowStatus: "rejected",
      nextActiveRoles: [],
    };
  }

  const { data: refreshedRows } = await admin
    .from("workflow_stages")
    .select("id, stage_key, stage_order, approver_role, status")
    .eq("instance_id", instance.id as string)
    .order("stage_order", { ascending: true });
  const refreshed = (refreshedRows ?? []) as WorkflowStageRow[];
  const currentPending = refreshed.filter(
    (s) => Number(s.stage_order) === currentOrder && OPEN_STAGE_STATUSES.has(s.status),
  );
  if (currentPending.length > 0) {
    const nextActiveRoles = refreshed
      .filter(
        (s) => Number(s.stage_order) === currentOrder && ACTIONABLE_STAGE_STATUSES.has(s.status),
      )
      .map((s) => s.approver_role || "unknown");
    return {
      ok: true,
      instanceId: instance.id as string,
      stageId: roleMatchedStage.id,
      workflowStatus: "active",
      nextActiveRoles,
    };
  }

  return advanceRequisitionAfterApproval(admin, {
    instance,
    hiringRequestId: params.hiringRequestId,
    orders,
    currentOrder,
    refreshed,
    roleMatchedStageId: roleMatchedStage.id,
    nowIso,
  });
}
