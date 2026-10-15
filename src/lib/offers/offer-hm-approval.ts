import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/types/database";
import type { SettingsPermissions } from "@/lib/settings/permissions";
import { createNotification } from "@/lib/services/notifications";
import { listApproverProfileIdsForRole } from "@/lib/approvals/actor-resolution";
import { recordHiringOfferAuditEvent } from "@/lib/audit/hiring-offer-audit";
import { validateOfferTransition } from "@/lib/workflows/offer-state-machine";

/** Retained helper for compatibility with existing tests/callers. */
export function offerNeedsFinanceAfterHmApproval(
  _bandStatus: string | null | undefined,
  _permissions: SettingsPermissions,
): boolean {
  return true;
}

export function canProfileApproveOfferDraft(params: {
  actorUserId: string;
  actorRole: UserRole;
  jobHiringManagerId: string | null | undefined;
  permissions: SettingsPermissions;
}): boolean {
  const { actorUserId, actorRole, jobHiringManagerId, permissions } = params;
  if (actorRole === "super_admin" || actorRole === "leadership") return true;
  const extra = permissions.offerDraftApproverProfileIds ?? [];
  if (extra.includes(actorUserId)) return true;
  if (actorRole === "hiring_manager" && jobHiringManagerId && jobHiringManagerId === actorUserId) {
    return true;
  }
  return false;
}

export async function executeHiringManagerOfferApproval(params: {
  admin: SupabaseClient;
  offerId: string;
  organisationId: string;
  actorProfileId: string;
  actorRole: UserRole;
  requestIp: string | null;
  permissions: SettingsPermissions;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { admin, offerId, organisationId, actorProfileId, actorRole, requestIp, permissions } =
    params;

  const { data: offer, error: offerErr } = await admin
    .from("offers")
    .select("id, status, band_status, role_title, application_id")
    .eq("id", offerId)
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (offerErr || !offer) {
    return { ok: false, status: 404, error: "Offer not found" };
  }

  if ((offer.status as string) !== "draft") {
    return { ok: false, status: 409, error: "Only draft offers can be approved at this step" };
  }

  const applicationId = offer.application_id as string;
  const { data: application, error: appErr } = await admin
    .from("applications")
    .select("job_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (appErr || !application?.job_id) {
    return { ok: false, status: 400, error: "Offer application is missing a job" };
  }

  const { data: job, error: jobErr } = await admin
    .from("jobs")
    .select("hiring_manager_id")
    .eq("id", application.job_id as string)
    .maybeSingle();

  if (jobErr) {
    return { ok: false, status: 500, error: "Failed to load job for approver check" };
  }

  const hiringManagerId = (job?.hiring_manager_id as string | null | undefined) ?? null;

  if (
    !canProfileApproveOfferDraft({
      actorUserId: actorProfileId,
      actorRole,
      jobHiringManagerId: hiringManagerId,
      permissions,
    })
  ) {
    return { ok: false, status: 403, error: "You are not allowed to approve this offer draft" };
  }

  const bandStatus = offer.band_status as string | null | undefined;
  const nextStatus = "pending_admin";
  const transition = validateOfferTransition({
    from: String(offer.status ?? ""),
    to: nextStatus,
    actorRole,
  });
  if (!transition.ok) {
    return { ok: false, status: transition.status, error: transition.error };
  }

  const { data: updated, error: updErr } = await admin
    .from("offers")
    .update({ status: nextStatus })
    .eq("id", offerId)
    .eq("status", "draft")
    .select("id, status")
    .maybeSingle();

  if (updErr || !updated) {
    return { ok: false, status: 500, error: "Failed to update offer status" };
  }

  await recordHiringOfferAuditEvent({
    organisationId,
    entityType: "offer",
    entityId: offerId,
    eventType: "OFFER_HIRING_MANAGER_APPROVED",
    actorProfileId,
    actorRole,
    prevStatus: "draft",
    newStatus: nextStatus,
    decision: "approved",
    ipAddress: requestIp ?? undefined,
    metadata: { pending_admin_approval: true, band_status: bandStatus ?? null },
  });

  const adminApproverIds = await listApproverProfileIdsForRole(admin, {
    organisationId,
    role: "leadership",
  });
  for (const approverId of adminApproverIds) {
    await createNotification({
      userId: approverId,
      type: "approval_needed",
      title: "Offer pending admin approval",
      body: `Offer for ${(offer.role_title as string) ?? "a role"} is awaiting your approval.`,
      link: "/company/approvals",
      metadata: { offerId, source: "offer_pending_admin" },
    });
  }

  return { ok: true };
}
