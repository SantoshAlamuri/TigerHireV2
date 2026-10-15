import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequisitionWorkflowSnapshot, WorkflowStageRow } from "./types";
import { ACTIONABLE_STAGE_STATUSES, PENDING_REQUISITION_STATUSES } from "./types";
import {
  actorMayDecideRole,
  openStagesAtOrder,
  repairStuckRequisitionWorkflowStages,
  uniqueOrders,
} from "./helpers";

/** Read-only snapshot for hiring-request UI (who must approve, workflow blockers). */
export async function getRequisitionWorkflowSnapshot(
  admin: SupabaseClient,
  hiringRequestId: string,
  actor?: { profileId: string; organisationId: string; role: string },
): Promise<RequisitionWorkflowSnapshot> {
  const { data: instance } = await admin
    .from("workflow_instances")
    .select("id, status, definition_key")
    .eq("subject_type", "hiring_request")
    .eq("subject_id", hiringRequestId)
    .eq("status", "active")
    .maybeSingle();

  if (!instance?.id) {
    const { data: request } = await admin
      .from("hiring_requests")
      .select("status")
      .eq("id", hiringRequestId)
      .maybeSingle();
    const requestStatus = String(request?.status ?? "");
    if (PENDING_REQUISITION_STATUSES.has(requestStatus)) {
      const { data: completedInstance } = await admin
        .from("workflow_instances")
        .select("id")
        .eq("subject_type", "hiring_request")
        .eq("subject_id", hiringRequestId)
        .eq("status", "completed")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (completedInstance?.id) {
        return {
          instanceStatus: "completed",
          awaitingRoles: [],
          issue:
            "Approval workflow already finished — approve once more to sync status and create the draft role.",
          pendingTaskId: null,
        };
      }
      return {
        instanceStatus: null,
        awaitingRoles: [],
        issue:
          "Approval workflow was not started — it will be created automatically when you approve.",
        pendingTaskId: null,
      };
    }
    return {
      instanceStatus: null,
      awaitingRoles: [],
      issue: null,
      pendingTaskId: null,
    };
  }

  const { data: stageRows } = await admin
    .from("workflow_stages")
    .select("id, stage_key, stage_order, approver_role, status")
    .eq("instance_id", instance.id as string)
    .order("stage_order", { ascending: true });
  let stages = (stageRows ?? []) as WorkflowStageRow[];
  if (!stages.length) {
    return {
      instanceStatus: "active",
      awaitingRoles: [],
      issue: "Approval workflow stages are missing for this requisition.",
      pendingTaskId: null,
    };
  }

  let currentOrder = uniqueOrders(stages).find((order) =>
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
    currentOrder = uniqueOrders(stages).find((order) =>
      openStagesAtOrder(stages, order).some((s) => ACTIONABLE_STAGE_STATUSES.has(s.status)),
    );
  }

  if (currentOrder == null) {
    const breached = stages.some((s) => s.status === "breached");
    return {
      instanceStatus: "active",
      awaitingRoles: [],
      issue: breached
        ? "Approval SLA was breached — ask an admin to reset the workflow or clone this requisition."
        : "Workflow has no active stage — ask an admin to review approval settings.",
      pendingTaskId: null,
    };
  }

  const actionableAtOrder = openStagesAtOrder(stages, currentOrder).filter((s) =>
    ACTIONABLE_STAGE_STATUSES.has(s.status),
  );
  const awaitingRoles = actionableAtOrder.map((s) => String(s.approver_role ?? "")).filter(Boolean);

  let pendingTaskId: string | null = null;
  if (actor) {
    for (const stage of actionableAtOrder) {
      if (actor.role === "super_admin") {
        pendingTaskId = `requisition:${stage.id}`;
        break;
      }
      const may = await actorMayDecideRole(admin, {
        organisationId: actor.organisationId,
        actorProfileId: actor.profileId,
        requiredRole: stage.approver_role,
      });
      if (may) {
        pendingTaskId = `requisition:${stage.id}`;
        break;
      }
    }
  }

  return {
    instanceStatus: "active",
    awaitingRoles: [...new Set(awaitingRoles)],
    issue: null,
    pendingTaskId,
  };
}
