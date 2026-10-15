import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { getRequisitionApprovalWorkflowDefinition } from "@/lib/workflows/requisition-approval-definitions";
import {
  canActorApproveRequiredRole,
  hasActiveApproverForRole,
} from "@/lib/approvals/actor-resolution";
import { loadDefaultChain } from "@/lib/workflows/requisition-chain-store";
import { resolveChain } from "@/lib/workflows/requisition-chain";
import type { StagePlanRow, WorkflowStageRow } from "./types";
import { OPEN_STAGE_STATUSES, TERMINAL_STAGE_STATUSES } from "./types";

export function uniqueOrders(stages: WorkflowStageRow[]): number[] {
  return [...new Set(stages.map((s) => Number(s.stage_order)))].sort((a, b) => a - b);
}

export function openStagesAtOrder(stages: WorkflowStageRow[], order: number): WorkflowStageRow[] {
  return stages.filter((s) => Number(s.stage_order) === order && OPEN_STAGE_STATUSES.has(s.status));
}

/**
 * SLA cron can leave stages escalated/breached with no actionable stage, or leave the next
 * order pending without activation. Reactivate the first incomplete order so recruiters can decide.
 */
export async function repairStuckRequisitionWorkflowStages(
  admin: SupabaseClient,
  params: { instanceId: string; definitionKey: string },
  stages: WorkflowStageRow[],
): Promise<WorkflowStageRow[]> {
  const orders = uniqueOrders(stages);
  const def = getRequisitionApprovalWorkflowDefinition(params.definitionKey || "");
  const nowIso = new Date().toISOString();

  for (const order of orders) {
    const group = stages.filter((s) => Number(s.stage_order) === order);
    if (group.length === 0) continue;
    if (group.every((s) => TERMINAL_STAGE_STATUSES.has(s.status))) continue;

    const toActivate = group.filter((s) => ["pending", "escalated", "breached"].includes(s.status));
    if (toActivate.length === 0) continue;

    for (const stage of toActivate) {
      const stageHours = def.stages.find((d) => d.stageKey === stage.stage_key)?.slaHours ?? 8;
      await admin
        .from("workflow_stages")
        .update({
          status: "active",
          sla_due_at: new Date(Date.now() + stageHours * 3600 * 1000).toISOString(),
          // Preserve breach_recorded_at: a stage that genuinely breached its SLA
          // must keep that history even after being repaired, or time-to-approve
          // reporting understates real breaches. (#351)
          updated_at: nowIso,
        })
        .eq("id", stage.id);
    }

    logger.info("repairStuckRequisitionWorkflowStages: reactivated stages", {
      instanceId: params.instanceId,
      stageOrder: order,
      stageIds: toActivate.map((s) => s.id),
    });

    const { data: refreshedRows } = await admin
      .from("workflow_stages")
      .select("id, stage_key, stage_order, approver_role, status")
      .eq("instance_id", params.instanceId)
      .order("stage_order", { ascending: true });
    return (refreshedRows ?? []) as WorkflowStageRow[];
  }

  return stages;
}

// Re-exported so existing importers of this module keep working unchanged; the
// implementation moved out to keep this file under the 250-line size gate.
export { notifyActiveRequisitionApprovers } from "./notify-approvers";

export async function actorMayDecideRole(
  admin: SupabaseClient,
  params: { organisationId: string; actorProfileId: string; requiredRole: string | null },
): Promise<boolean> {
  return canActorApproveRequiredRole(admin, params);
}

export async function hasActiveApproverRole(
  admin: SupabaseClient,
  params: { organisationId: string; role: string },
): Promise<boolean> {
  try {
    return await hasActiveApproverForRole(admin, params);
  } catch (err) {
    logger.warn("hasActiveApproverRole lookup failed", {
      organisationId: params.organisationId,
      role: params.role,
      error: String(err),
    });
    return true;
  }
}

function preferredInitialApproverRole(initiatorRole?: string | null): string | null {
  if (initiatorRole === "hiring_manager") return "recruiter";
  if (initiatorRole === "recruiter") return "leadership";
  return null;
}

export async function buildInitialStagePlan(
  admin: SupabaseClient,
  params: {
    organisationId: string;
    definitionKey: string;
    initiatorRole?: string | null;
    /** Who raised it — they never approve their own requisition. */
    initiatorProfileId?: string | null;
    /** hiring_requests.budget_ctc_max, for budget-threshold skips. */
    budgetMax?: number | null;
  },
): Promise<StagePlanRow[]> {
  /**
   * An organisation's own policy wins over the shipped presets.
   *
   * Both presets always require Finance, so an org without a finance function
   * had requisitions waiting on an approver who does not exist. Where a chain
   * has been authored it is used; where one has not, nothing changes — the
   * preset path below runs exactly as before.
   */
  const chain = await loadDefaultChain(admin, params.organisationId);
  if (chain) {
    const resolved = resolveChain(chain, {
      raiserRole: params.initiatorRole ?? null,
      raiserProfileId: params.initiatorProfileId ?? null,
      budgetMax: params.budgetMax ?? null,
    });
    if (resolved.skipped.length > 0) {
      // A skipped step is not an approval. Logged so the audit trail can say
      // why a stage that the policy contains does not appear on this one.
      logger.info("requisition chain: steps skipped by policy", {
        organisationId: params.organisationId,
        chainId: chain.id,
        skipped: resolved.skipped,
      });
    }
    if (resolved.autoApprove) {
      // The org explicitly authored a no-approval chain. Honoured, and named, so
      // that "nobody approved this" is a recorded decision rather than a gap.
      logger.warn("requisition chain resolves to no approval steps (explicit policy)", {
        organisationId: params.organisationId,
        chainId: chain.id,
        reason: resolved.autoApproveReason,
      });
      return [];
    }
    if (resolved.blockedNoApprovers) {
      // Every authored step was skipped and the org did NOT explicitly configure
      // a no-approval policy. Do NOT auto-approve — fall through to the preset
      // default chain so a human still signs off. (#351)
      logger.warn(
        "requisition chain resolved to zero approvers with no explicit no-approval policy — falling back to default approval chain",
        {
          organisationId: params.organisationId,
          chainId: chain.id,
          reason: resolved.blockedReason,
        },
      );
      // (fall through to the preset default below)
    } else {
      return resolved.steps.map((s) => ({
        stageKey: s.stageKey,
        stageOrder: s.stageOrder,
        approverRole: s.approverRole,
        slaHours: s.slaHours,
      }));
    }
  }

  const def = getRequisitionApprovalWorkflowDefinition(params.definitionKey);
  const preferredRole = preferredInitialApproverRole(params.initiatorRole);
  const baseRows: StagePlanRow[] = def.stages.map((s) => ({
    stageKey: s.stageKey,
    stageOrder: s.stageOrder,
    approverRole: s.approverRole,
    slaHours: s.slaHours,
  }));

  if (!preferredRole) return baseRows;

  const hasApprover = await hasActiveApproverRole(admin, {
    organisationId: params.organisationId,
    role: preferredRole,
  });
  if (!hasApprover) return baseRows;

  const preferredRows = baseRows.filter((row) => row.approverRole === preferredRole);
  const nonPreferredRows = baseRows.filter((row) => row.approverRole !== preferredRole);

  const plannedRows =
    preferredRows.length > 0
      ? [...preferredRows, ...nonPreferredRows]
      : [
          {
            stageKey: `initiator_${preferredRole}`,
            stageOrder: 0,
            approverRole: preferredRole,
            slaHours: 8,
          },
          ...baseRows,
        ];

  // Re-index to a clean sequential workflow order after creator-aware routing.
  return plannedRows.map((row, index) => ({
    ...row,
    stageOrder: index + 1,
  }));
}
