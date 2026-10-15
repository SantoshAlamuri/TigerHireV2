import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getRequestClientIp } from "@/lib/audit/client-ip";
import { insertOfferEvent } from "@/lib/offers/offer-events";
import { syncPipelineOnNativeOfferDeclined } from "@/lib/offers/offer-signing-pipeline";
import { sendNativeOfferDeclinedRecruiterEmail } from "@/lib/offers/offer-native-notifications";
import { createNotification } from "@/lib/services/notifications";
import { logger } from "@/lib/observability/logger";
import { recordHiringOfferAuditEvent } from "@/lib/audit/hiring-offer-audit";

const bodySchema = z.object({
  reason: z.string().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token || token.length < 16) return jsonError("Offer link not found", 404);

    const ip =
      getRequestClientIp(request) ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const rl = await checkRateLimit({
      key: `offer-pub-decline:${ip}:${token.slice(0, 12)}`,
      limit: 20,
      windowSecs: 300,
    });
    if (!rl.allowed) {
      return jsonError("Too many requests. Please try again later.", 429);
    }

    const parsedBody = await parseJsonBody(request, "POST /api/offers/public/[token]/decline");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = bodySchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const reason = parsed.data.reason?.trim() || null;
    const ua = request.headers.get("user-agent") ?? "";

    const admin = createSupabaseAdmin();
    const { data: offer, error } = await admin
      .from("offers")
      .select(
        "id, status, signing_status, expires_at, organisation_id, application_id, role_title, created_by, applications(candidate_id)",
      )
      .eq("public_token", token)
      .maybeSingle();

    if (error || !offer) return jsonError("Offer link not found", 404);

    const now = Date.now();
    const expiresAt = offer.expires_at as string | null;
    if (expiresAt && new Date(expiresAt).getTime() < now) {
      return jsonError("Offer has expired", 400);
    }
    if ((offer.status as string) === "accepted" || offer.signing_status === "signed") {
      return jsonError("Already signed", 400);
    }
    if ((offer.status as string) === "declined" || offer.signing_status === "declined") {
      return jsonError("Already declined", 400);
    }
    if (offer.signing_status === "pending_company") {
      return jsonError("Offer is awaiting company signature", 409);
    }
    if ((offer.status as string) !== "sent") {
      return jsonError("Offer is not open for response", 400);
    }

    const nowIso = new Date().toISOString();
    const { data: updated, error: updErr } = await admin
      .from("offers")
      .update({
        status: "declined",
        signing_status: "declined",
        declined_at: nowIso,
        responded_at: nowIso,
        decline_reason: reason,
      })
      .eq("id", offer.id as string)
      .eq("status", "sent")
      .select("application_id")
      .maybeSingle();

    if (updErr || !updated) {
      return jsonError("Offer is not open for response", 400);
    }

    await insertOfferEvent(admin, {
      offerId: offer.id as string,
      eventType: "declined",
      actorIp: ip,
      actorUserAgent: ua,
      metadata: reason ? { reason } : null,
    });

    await recordHiringOfferAuditEvent({
      organisationId: offer.organisation_id as string,
      entityType: "offer",
      entityId: offer.id as string,
      eventType: "OFFER_DECLINED",
      actorProfileId: null,
      actorRole: "candidate_public",
      prevStatus: "sent",
      newStatus: "declined",
      decision: "native_decline",
      comments: reason,
      ipAddress: ip,
      channel: "email_link",
      metadata: reason ? { reason } : {},
    });

    const candRow = offer.applications as { candidate_id?: string } | null;
    const candidateId = candRow?.candidate_id as string | undefined;
    let candidateDisplay = "Candidate";
    if (candidateId) {
      const { data: cand } = await admin
        .from("candidates")
        .select("name, full_name")
        .eq("id", candidateId)
        .maybeSingle();
      candidateDisplay =
        ((cand?.full_name as string | null) ?? "").trim() ||
        ((cand?.name as string | null) ?? "").trim() ||
        "Candidate";
    }

    if (offer.created_by) {
      const ok = await createNotification({
        userId: offer.created_by as string,
        type: "application_update",
        title: "Offer declined by candidate",
        body: reason ?? "The candidate declined the offer.",
        link: "/company/offers",
        metadata: { offerId: offer.id as string },
      });
      if (!ok) {
        logger.warn("createNotification failed on decline", { offerId: offer.id });
      }
    }

    await sendNativeOfferDeclinedRecruiterEmail(admin, {
      createdByProfileId: (offer.created_by as string | null) ?? null,
      candidateName: candidateDisplay,
      roleTitle: offer.role_title as string,
      reason,
    });

    const applicationId = updated.application_id as string | undefined;
    if (applicationId) {
      await syncPipelineOnNativeOfferDeclined(admin, { applicationId });
    }

    return jsonSuccess({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to decline offer", {
      route: "POST /api/offers/public/[token]/decline",
    });
  }
}
