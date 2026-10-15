import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { getOfferFinanceApprovalWorkflowDefinition } from "@/lib/workflows/offer-finance-approval-definitions";

/**
 * After a candidate counter-offer or HM approval with band exception, finance must review.
 * Starts a fresh workflow instance using the organisation's predefined template (`definitionKey`).
 */
export async function startOfferFinanceReviewRound(
  admin: SupabaseClient,
  params: { organisationId: string; offerId: string; definitionKey: string },
): Promise<void> {
  const def = getOfferFinanceApprovalWorkflowDefinition(params.definitionKey);

  const { data: staleActive, error: staleErr } = await admin
    .from("workflow_instances")
    .select("id")
    .eq("subject_type", "offer")
    .eq("subject_id", params.offerId)
    .eq("status", "active")
    .maybeSingle();

  if (staleErr) {
    logger.warn("startOfferFinanceReviewRound: lookup active instance failed", {
      error: staleErr.message,
      offerId: params.offerId,
    });
    return;
  }

  const nowIso = new Date().toISOString();
  if (staleActive?.id) {
    await admin
      .from("workflow_instances")
      .update({ status: "cancelled", updated_at: nowIso })
      .eq("id", staleActive.id as string);
  }

  const firstSlaHours = def.stages[0]?.slaHours ?? 8;

  const { data: inserted, error: insErr } = await admin
    .from("workflow_instances")
    .insert({
      organisation_id: params.organisationId,
      subject_type: "offer",
      subject_id: params.offerId,
      definition_key: def.key,
      status: "active",
      meta: { sla_hours: firstSlaHours },
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    logger.warn("startOfferFinanceReviewRound: insert instance failed", {
      offerId: params.offerId,
      error: insErr?.message,
    });
    return;
  }

  const instanceId = inserted.id as string;
  const t0 = Date.now();
  const stageRows = def.stages.map((s, i) => {
    const isFirst = i === 0;
    return {
      instance_id: instanceId,
      stage_key: s.stageKey,
      stage_order: s.stageOrder,
      approver_role: s.approverRole,
      status: isFirst ? "active" : "pending",
      sla_due_at: isFirst ? new Date(t0 + s.slaHours * 3600 * 1000).toISOString() : null,
    };
  });

  const { error: stageErr } = await admin.from("workflow_stages").insert(stageRows);

  if (stageErr) {
    logger.warn("startOfferFinanceReviewRound: insert stages failed", {
      offerId: params.offerId,
      error: stageErr.message,
    });
  }
}

/**
 * Completes the current active/pending workflow stage for an offer, then activates the next
 * stage (same definition) or closes the instance. Used when finance approves or rejects.
 */
export async function completeActiveOfferFinanceStage(
  admin: SupabaseClient,
  params: {
    offerId: string;
    profileId: string;
    decision: "approved" | "rejected";
    comment?: string | null;
  },
): Promise<{ instanceId: string | null; stageId: string | null }> {
  const { data: instance, error: instErr } = await admin
    .from("workflow_instances")
    .select("id, definition_key")
    .eq("subject_type", "offer")
    .eq("subject_id", params.offerId)
    .eq("status", "active")
    .maybeSingle();

  if (instErr || !instance?.id) {
    return { instanceId: null, stageId: null };
  }

  const instanceId = instance.id as string;
  const defKey = (instance.definition_key as string) || "offer_finance_v1";
  const def = getOfferFinanceApprovalWorkflowDefinition(defKey);

  const { data: stages, error: stagesErr } = await admin
    .from("workflow_stages")
    .select("id, status, stage_order, stage_key")
    .eq("instance_id", instanceId)
    .order("stage_order", { ascending: true });

  if (stagesErr || !stages?.length) {
    return { instanceId, stageId: null };
  }

  const ordered = [...stages].sort((a, b) => (a.stage_order as number) - (b.stage_order as number));
  const current = ordered.find((s) => s.status === "active" || s.status === "pending");
  if (!current?.id) {
    return { instanceId, stageId: null };
  }

  const stageStatus = params.decision === "approved" ? "approved" : "rejected";
  const now = new Date().toISOString();

  await admin
    .from("workflow_stages")
    .update({
      status: stageStatus,
      decided_at: now,
      decided_by: params.profileId,
      decision: params.decision,
      comments: params.comment ?? null,
      updated_at: now,
    })
    .eq("id", current.id);

  if (params.decision === "rejected") {
    await admin
      .from("workflow_instances")
      .update({
        status: "cancelled",
        updated_at: now,
      })
      .eq("id", instanceId);
    return { instanceId, stageId: current.id as string };
  }

  const currentOrder = current.stage_order as number;
  const next = ordered.find(
    (s) => (s.status as string) === "pending" && (s.stage_order as number) > currentOrder,
  );

  if (next?.id) {
    const nextKey = next.stage_key as string;
    const slaHours =
      def.stages.find((s) => s.stageKey === nextKey)?.slaHours ?? def.stages[0]?.slaHours ?? 8;
    await admin
      .from("workflow_stages")
      .update({
        status: "active",
        sla_due_at: new Date(Date.now() + slaHours * 3600 * 1000).toISOString(),
        updated_at: now,
      })
      .eq("id", next.id as string);

    await admin
      .from("workflow_instances")
      .update({
        meta: { sla_hours: slaHours },
        updated_at: now,
      })
      .eq("id", instanceId);
  } else {
    await admin
      .from("workflow_instances")
      .update({
        status: "completed",
        updated_at: now,
      })
      .eq("id", instanceId);
  }

  return { instanceId, stageId: current.id as string };
}
