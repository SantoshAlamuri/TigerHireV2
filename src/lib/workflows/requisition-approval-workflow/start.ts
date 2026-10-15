import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { getRequisitionApprovalWorkflowDefinition } from "@/lib/workflows/requisition-approval-definitions";
import {
  getOrgSettingsPermissions,
  resolveRequisitionApprovalWorkflowDefinitionKey,
} from "@/lib/settings/permissions";
import type { WorkflowInstanceRow } from "./types";
import { PENDING_REQUISITION_STATUSES } from "./types";
import { buildInitialStagePlan, notifyActiveRequisitionApprovers } from "./helpers";
import { planLeadingFinanceSkips, FINANCE_AUTO_SKIP_COMMENT } from "./skip-unactionable-finance";

/**
 * Resolves an active workflow instance for a pending requisition. Bootstraps when missing
 * (E2E seeds, failed submit hook) or treats a completed instance as ready to finalize.
 */
export async function ensureActiveRequisitionWorkflowInstance(
  admin: SupabaseClient,
  hiringRequestId: string,
): Promise<
  | { kind: "active"; instance: WorkflowInstanceRow }
  | { kind: "already_completed"; instanceId: string }
  | { kind: "unavailable"; error: string; status: number }
> {
  const { data: active } = await admin
    .from("workflow_instances")
    .select("id, organisation_id, definition_key, status")
    .eq("subject_type", "hiring_request")
    .eq("subject_id", hiringRequestId)
    .eq("status", "active")
    .maybeSingle();

  if (active?.id) {
    return { kind: "active", instance: active as WorkflowInstanceRow };
  }

  const { data: request } = await admin
    .from("hiring_requests")
    .select("organisation_id, status, urgency, title, created_by, budget_ctc_max")
    .eq("id", hiringRequestId)
    .maybeSingle();

  if (!request) {
    return { kind: "unavailable", error: "Requisition not found", status: 404 };
  }

  const requestStatus = String(request.status ?? "");
  if (!PENDING_REQUISITION_STATUSES.has(requestStatus)) {
    return {
      kind: "unavailable",
      error: "No active workflow found for this requisition",
      status: 409,
    };
  }

  const { data: latestInstance } = await admin
    .from("workflow_instances")
    .select("id, status")
    .eq("subject_type", "hiring_request")
    .eq("subject_id", hiringRequestId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestInstance?.status === "completed") {
    logger.info("ensureActiveRequisitionWorkflowInstance: workflow already completed", {
      hiringRequestId,
      instanceId: latestInstance.id,
    });
    return { kind: "already_completed", instanceId: latestInstance.id as string };
  }

  const { data: creator } = await admin
    .from("profiles")
    .select("role")
    .eq("id", request.created_by as string)
    .maybeSingle();

  const permissions = await getOrgSettingsPermissions(admin, request.organisation_id as string);
  const definitionKey = resolveRequisitionApprovalWorkflowDefinitionKey(permissions);

  await startRequisitionApprovalWorkflow(admin, {
    organisationId: request.organisation_id as string,
    hiringRequestId,
    definitionKey,
    urgency: (request.urgency as string | null) ?? null,
    requestTitle: (request.title as string | null) ?? null,
    initiatorRole: (creator?.role as string | null) ?? null,
    initiatorProfileId: (request.created_by as string | null) ?? null,
    budgetMax: request.budget_ctc_max == null ? null : Number(request.budget_ctc_max),
  });

  const { data: bootstrapped } = await admin
    .from("workflow_instances")
    .select("id, organisation_id, definition_key, status")
    .eq("subject_type", "hiring_request")
    .eq("subject_id", hiringRequestId)
    .eq("status", "active")
    .maybeSingle();

  if (!bootstrapped?.id) {
    return {
      kind: "unavailable",
      error: "Could not start approval workflow for this requisition",
      status: 409,
    };
  }

  logger.info("ensureActiveRequisitionWorkflowInstance: bootstrapped workflow", {
    hiringRequestId,
    instanceId: bootstrapped.id,
  });

  return { kind: "active", instance: bootstrapped as WorkflowInstanceRow };
}

export async function startRequisitionApprovalWorkflow(
  admin: SupabaseClient,
  params: {
    organisationId: string;
    hiringRequestId: string;
    definitionKey: string;
    urgency?: string | null;
    requestTitle?: string | null;
    initiatorRole?: string | null;
    /** Who raised it — an org chain never routes a step back to them. */
    initiatorProfileId?: string | null;
    /** hiring_requests.budget_ctc_max, for budget-threshold skips. */
    budgetMax?: number | null;
  },
): Promise<void> {
  const resolvedDefinitionKey = getRequisitionApprovalWorkflowDefinition(params.definitionKey).key;
  const stagePlan = await buildInitialStagePlan(admin, {
    organisationId: params.organisationId,
    definitionKey: params.definitionKey,
    initiatorRole: params.initiatorRole,
    initiatorProfileId: params.initiatorProfileId ?? null,
    budgetMax: params.budgetMax ?? null,
  });
  const { data: active } = await admin
    .from("workflow_instances")
    .select("id")
    .eq("subject_type", "hiring_request")
    .eq("subject_id", params.hiringRequestId)
    .eq("status", "active")
    .maybeSingle();

  const nowIso = new Date().toISOString();
  if (active?.id) {
    await admin
      .from("workflow_instances")
      .update({ status: "cancelled", updated_at: nowIso })
      .eq("id", active.id as string);
  }

  // A chain that opens on finance, in an org with no finance seat, could never be
  // actioned — the existing skip in advanceRequisitionAfterApproval only fires
  // when advancing PAST a decision, never for the order created active here.
  const { skippedOrders, activeOrder } = await planLeadingFinanceSkips(admin, {
    organisationId: params.organisationId,
    stagePlan,
    hiringRequestId: params.hiringRequestId,
  });

  // The instance SLA belongs to the stage somebody will actually action, not to a
  // skipped one.
  const firstSlaHours = stagePlan.find((s) => s.stageOrder === activeOrder)?.slaHours ?? 8;
  const isUrgent = params.urgency === "urgent" || params.urgency === "critical";
  const adjustedFirstSlaHours = isUrgent
    ? Math.max(2, Math.floor(firstSlaHours / 2))
    : firstSlaHours;

  const { data: inserted, error: instanceErr } = await admin
    .from("workflow_instances")
    .insert({
      organisation_id: params.organisationId,
      subject_type: "hiring_request",
      subject_id: params.hiringRequestId,
      definition_key: resolvedDefinitionKey,
      status: "active",
      meta: { sla_hours: adjustedFirstSlaHours, urgency: params.urgency ?? null },
    })
    .select("id")
    .single();

  if (instanceErr || !inserted?.id) {
    logger.warn("startRequisitionApprovalWorkflow: failed to insert instance", {
      error: instanceErr?.message,
      hiringRequestId: params.hiringRequestId,
    });
    return;
  }

  const now = Date.now();
  const rows = stagePlan.map((s) => {
    const isSkipped = skippedOrders.has(s.stageOrder);
    const isInitial = !isSkipped && s.stageOrder === activeOrder;
    const stageHours = isUrgent ? Math.max(2, Math.floor(s.slaHours / 2)) : s.slaHours;
    return {
      instance_id: inserted.id as string,
      stage_key: s.stageKey,
      stage_order: s.stageOrder,
      approver_role: s.approverRole,
      status: isSkipped ? "approved" : isInitial ? "active" : "pending",
      ...(isSkipped
        ? {
            decision: "approved",
            comments: FINANCE_AUTO_SKIP_COMMENT,
            decided_at: nowIso,
          }
        : {}),
      sla_due_at: isInitial ? new Date(now + stageHours * 3600 * 1000).toISOString() : null,
    };
  });
  const { error: stageErr } = await admin.from("workflow_stages").insert(rows);
  if (stageErr) {
    logger.warn("startRequisitionApprovalWorkflow: failed to insert stages", {
      error: stageErr.message,
      hiringRequestId: params.hiringRequestId,
    });
    return;
  }

  const activeRoles = rows
    .filter((r) => r.status === "active")
    .map((r) => String(r.approver_role ?? ""))
    .filter(Boolean);
  await notifyActiveRequisitionApprovers(admin, {
    organisationId: params.organisationId,
    hiringRequestId: params.hiringRequestId,
    requestTitle: params.requestTitle ?? "Hiring request",
    stageRoles: activeRoles,
  });
}
