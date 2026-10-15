import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/services/notifications";
import { logger } from "@/lib/observability/logger";
import { recordHiringOfferAuditEvent } from "@/lib/audit/hiring-offer-audit";
import { fireAndForgetVoidOfferEnvelope } from "@/lib/offers/void-offer-envelope";
import { enqueueAfterResponse } from "@/lib/jobs/enqueue-after-response";
import { validateOfferTransition } from "@/lib/workflows/offer-state-machine";
import { triggerOrganisationOutboundEvent } from "@/lib/webhooks/trigger-organisation-outbound";
import {
  syncPipelineOnNativeOfferAccepted,
  syncPipelineOnNativeOfferDeclined,
} from "@/lib/offers/offer-signing-pipeline";

export type OfferCandidateResponseBody = {
  response: "accept" | "decline" | "counter";
  comment?: string | null;
};

export async function executeOfferCandidateResponse(
  admin: SupabaseClient,
  params: {
    offerId: string;
    body: OfferCandidateResponseBody;
    candidateUserId: string;
    actorProfileId: string | null;
    actorRole: string | null;
    requestIp: string | null;
    auditChannel?: "web" | "api";
    auditMetadata?: Record<string, unknown>;
    /** Route name for logs */
    logRoute: string;
  },
): Promise<
  { ok: true; offer: Record<string, unknown> } | { ok: false; status: number; error: string }
> {
  const { offerId, body, candidateUserId, logRoute } = params;

  const { data: offer, error: offerError } = await admin
    .from("offers")
    .select(
      "id, status, expires_at, created_by, organisation_id, document_content, applications(candidate_id)",
    )
    .eq("id", offerId)
    .single();

  if (offerError || !offer) {
    return { ok: false, status: 404, error: "Offer not found" };
  }
  const docContent = offer.document_content as string | null | undefined;
  if (typeof docContent === "string" && docContent.trim().length > 0) {
    return {
      ok: false,
      status: 409,
      error:
        "This offer uses the secure signing page. Open your offer link to review, sign, or decline.",
    };
  }
  if (offer.expires_at && new Date(offer.expires_at as string).getTime() < Date.now()) {
    return { ok: false, status: 410, error: "Offer has expired" };
  }
  if (offer.status !== "sent") {
    return { ok: false, status: 409, error: "Offer is not open for response" };
  }

  const candidate = offer.applications as { candidate_id?: string } | null;
  if (!candidate?.candidate_id) {
    return { ok: false, status: 404, error: "Candidate not found for offer" };
  }

  const { data: candidateRecord, error: candErr } = await admin
    .from("candidates")
    .select("id, user_id")
    .eq("id", candidate.candidate_id)
    .single();
  if (candErr || !candidateRecord || candidateRecord.user_id !== candidateUserId) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  await admin.from("offer_candidate_responses").upsert({
    offer_id: offerId,
    response: body.response,
    comment: body.comment ?? null,
    responded_at: new Date().toISOString(),
  });

  const statusMap: Record<"accept" | "decline" | "counter", string> = {
    accept: "accepted",
    decline: "declined",
    counter: "negotiating",
  };
  const nextStatus = statusMap[body.response];
  const transition = validateOfferTransition({
    from: String(offer.status ?? ""),
    to: nextStatus,
    actorRole: String(params.actorRole ?? "candidate_pro"),
    reason: body.comment ?? null,
  });
  if (!transition.ok) {
    return { ok: false, status: transition.status, error: transition.error };
  }

  const respondedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("offers")
    .update({
      status: nextStatus,
      responded_at: respondedAt,
    })
    .eq("id", offerId)
    .eq("status", "sent")
    .select("*")
    .maybeSingle();

  if (!updated) {
    return { ok: false, status: 409, error: "Offer is not open for response" };
  }
  if (updateError) {
    return { ok: false, status: 500, error: "Failed to save offer response" };
  }

  const auditEventType =
    body.response === "accept"
      ? "OFFER_ACCEPTED"
      : body.response === "decline"
        ? "OFFER_DECLINED"
        : "OFFER_COUNTER";

  await recordHiringOfferAuditEvent({
    organisationId: offer.organisation_id as string,
    entityType: "offer",
    entityId: offerId,
    eventType: auditEventType,
    actorProfileId: params.actorProfileId,
    actorRole: params.actorRole,
    prevStatus: String(offer.status ?? ""),
    newStatus: nextStatus,
    decision: body.response,
    comments: body.comment ?? null,
    ipAddress: params.requestIp ?? undefined,
    channel: params.auditChannel ?? "web",
    metadata: { ...(params.auditMetadata ?? {}), response: body.response },
  });

  if (offer.created_by) {
    const notificationTitle =
      body.response === "accept"
        ? "Offer accepted by candidate"
        : body.response === "decline"
          ? "Offer declined by candidate"
          : "Candidate submitted a counter-offer";
    const ok = await createNotification({
      userId: offer.created_by as string,
      type: "application_update",
      title: notificationTitle,
      body: body.comment ?? "A candidate responded to an offer.",
      link: "/company/offers",
      metadata: { offerId, response: body.response },
    });
    if (!ok) {
      logger.warn("createNotification failed", {
        route: logRoute,
        userId: offer.created_by,
      });
    }
  }

  triggerOrganisationOutboundEvent({
    organisationId: offer.organisation_id as string,
    eventType: "offer.candidate_responded",
    data: {
      offerId,
      response: body.response,
      offerStatus: nextStatus,
      applicationId: updated.application_id,
      candidateId: candidate.candidate_id,
    },
  });

  if (body.response === "counter") {
    return { ok: true, offer: updated as Record<string, unknown> };
  }

  if (body.response === "accept") {
    const applicationId = updated.application_id as string | undefined;
    if (applicationId) {
      await syncPipelineOnNativeOfferAccepted(admin, {
        organisationId: offer.organisation_id as string,
        applicationId,
        offerId,
        compensationJson: (updated.compensation_json as Record<string, unknown> | null) ?? null,
      });
      // Durable post-response enqueue: a bare `void enqueue` here could vanish if
      // the serverless instance froze after the response — a signed offer that
      // never triggers background verification. (#349)
      enqueueAfterResponse(
        "offer-bgv-trigger",
        {
          offerId,
          organisationId: offer.organisation_id as string,
          candidateId: candidate.candidate_id as string,
          applicationId,
        },
        { id: `offer-bgv-trigger:${offerId}` },
      );
    } else {
      logger.warn("offer-bgv-trigger skipped: missing application_id on offer", {
        route: logRoute,
        offerId,
      });
    }
  }

  if (body.response === "decline") {
    const applicationId = updated.application_id as string | undefined;
    if (applicationId) {
      await syncPipelineOnNativeOfferDeclined(admin, { applicationId });
    }
    fireAndForgetVoidOfferEnvelope({ id: offer.id as string }, "Candidate declined offer in app");
  }

  return { ok: true, offer: updated as Record<string, unknown> };
}
