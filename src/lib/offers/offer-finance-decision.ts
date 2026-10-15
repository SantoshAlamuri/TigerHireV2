import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { createNotification } from "@/lib/services/notifications";
import { logger } from "@/lib/observability/logger";
import {
  recordHiringOfferAuditEvent,
  type HiringOfferAuditChannel,
} from "@/lib/audit/hiring-offer-audit";
import { completeActiveOfferFinanceStage } from "@/lib/workflows/offer-finance-workflow";
import { canActorApproveRequiredRole } from "@/lib/approvals/actor-resolution";
import { validateOfferTransition } from "@/lib/workflows/offer-state-machine";
import { executeOfferSend } from "@/lib/offers/offer-send";

async function offerHasCandidateCounterResponse(
  admin: SupabaseClient,
  offerId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("offer_candidate_responses")
    .select("id")
    .eq("offer_id", offerId)
    .eq("response", "counter")
    .maybeSingle();
  return Boolean(data);
}

export async function canProfileAdminDecideOnOffer(
  admin: SupabaseClient,
  profileId: string,
  offerOrganisationId: string,
): Promise<boolean> {
  const direct = await canActorApproveRequiredRole(admin, {
    organisationId: offerOrganisationId,
    actorProfileId: profileId,
    requiredRole: "leadership",
  });
  if (direct) return true;
  return hasAnyEnterpriseRole(profileId, ["leadership", "super_admin"], admin);
}

/**
 * Shared admin gate for POST /api/offers/[id]/finance and email deep links.
 */
export async function executeOfferFinanceDecision(
  admin: SupabaseClient,
  params: {
    offerId: string;
    decision: "approved" | "rejected";
    comment: string | null;
    actorProfileId: string;
    actorRole: string | null;
    requestIp: string | null;
    auditChannel?: HiringOfferAuditChannel;
    logRoute: string;
  },
): Promise<
  | {
      ok: true;
      offer: Record<string, unknown>;
      autoSend?: { sent: boolean; reason?: string; status?: number };
    }
  | { ok: false; status: number; error: string }
> {
  const { offerId, decision, comment, actorProfileId, actorRole, requestIp, logRoute } = params;
  const auditChannel = params.auditChannel ?? "web";

  const { data: offer, error: offerError } = await admin
    .from("offers")
    .select("id, created_by, organisation_id, status")
    .eq("id", offerId)
    .single();

  if (offerError || !offer) {
    return { ok: false, status: 404, error: "Offer not found" };
  }

  const orgId = offer.organisation_id as string;
  const allowed = await canProfileAdminDecideOnOffer(admin, actorProfileId, orgId);
  if (!allowed) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  if (offer.status !== "pending_admin" && offer.status !== "pending_finance") {
    return { ok: false, status: 409, error: "Offer is not awaiting admin decision" };
  }

  const nextStatus = decision === "approved" ? "approved" : "draft";
  const transition = validateOfferTransition({
    from: String(offer.status ?? ""),
    to: nextStatus,
    actorRole: actorRole ?? "",
    reason: comment,
  });
  if (!transition.ok) {
    return { ok: false, status: transition.status, error: transition.error };
  }
  const { data: updatedOffer, error: updateError } = await admin
    .from("offers")
    .update({ status: nextStatus })
    .eq("id", offerId)
    .in("status", ["pending_admin", "pending_finance"])
    .select("*")
    .maybeSingle();

  if (updateError) {
    return { ok: false, status: 500, error: "Failed to update offer decision" };
  }
  if (!updatedOffer) {
    return { ok: false, status: 409, error: "Offer is not awaiting finance decision" };
  }

  await admin.from("offer_approvals").insert({
    offer_id: offerId,
    approver_id: actorProfileId,
    decision,
    comment: comment ?? null,
  });

  await completeActiveOfferFinanceStage(admin, {
    offerId,
    profileId: actorProfileId,
    decision,
    comment: comment ?? null,
  });

  await recordHiringOfferAuditEvent({
    organisationId: orgId,
    entityType: "offer",
    entityId: offerId,
    eventType: "OFFER_ADMIN_DECISION",
    actorProfileId,
    actorRole,
    prevStatus: String(offer.status),
    newStatus: nextStatus,
    decision,
    comments: comment ?? null,
    ipAddress: requestIp ?? undefined,
    channel: auditChannel,
  });

  if (offer.created_by) {
    const ok = await createNotification({
      userId: offer.created_by as string,
      type: "approval_given",
      title: `Admin ${decision} the offer`,
      body: comment ?? "Admin has reviewed your offer request.",
      link: "/company/offers",
      metadata: { offerId, decision },
    });
    if (!ok) {
      logger.warn("createNotification failed", {
        route: logRoute,
        userId: offer.created_by,
      });
    }
  }

  if (decision !== "approved") {
    return { ok: true, offer: updatedOffer as Record<string, unknown> };
  }

  if (await offerHasCandidateCounterResponse(admin, offerId)) {
    return {
      ok: true,
      offer: updatedOffer as Record<string, unknown>,
      autoSend: {
        sent: false,
        reason:
          "Offer was revised after a candidate counter-offer. Send manually after re-approval.",
      },
    };
  }

  const sendResult = await executeOfferSend({
    offerId,
    actorProfileId,
    actorRole: actorRole ?? "leadership",
    actorOrganisationId: orgId,
    requestIp,
    userAgent: null,
    enforceSendCapability: false,
    logRoute,
  });

  if (!sendResult.ok) {
    logger.warn("Auto-send after finance approval did not complete", {
      offerId,
      status: sendResult.status,
      error: sendResult.error,
      route: logRoute,
    });
    return {
      ok: true,
      offer: updatedOffer as Record<string, unknown>,
      autoSend: {
        sent: false,
        reason: sendResult.error,
        status: sendResult.status,
      },
    };
  }

  return {
    ok: true,
    offer: sendResult.offer,
    autoSend: { sent: true },
  };
}
