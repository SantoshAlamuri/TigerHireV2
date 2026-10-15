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
import { generateSignedOfferPdf } from "@/lib/offers/generate-offer-pdf";
import { insertOfferEvent } from "@/lib/offers/offer-events";
import { syncPipelineOnNativeOfferAccepted } from "@/lib/offers/offer-signing-pipeline";
import { sendNativeSignedOfferEmailsWithPdf } from "@/lib/offers/offer-native-notifications";
import { createNotification } from "@/lib/services/notifications";
import { logger } from "@/lib/observability/logger";
import { enqueueAfterResponse } from "@/lib/jobs/enqueue-after-response";
import { upsertSignedOfferDocumentVersion } from "@/lib/offers/offer-document-versions";
import { recordHiringOfferAuditEvent } from "@/lib/audit/hiring-offer-audit";
import { triggerOrganisationOutboundEvent } from "@/lib/webhooks/trigger-organisation-outbound";
import {
  readOfferPublicSessionCookie,
  verifyOfferPublicSession,
} from "@/lib/offers/offer-public-link";

const bodySchema = z.object({
  signer_name: z.string().min(1).max(200),
});

/**
 * POST /api/offers/public/[token]/sign — native typed-name acceptance.
 */
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
      key: `offer-pub-sign:${ip}:${token.slice(0, 12)}`,
      limit: 20,
      windowSecs: 300,
    });
    if (!rl.allowed) {
      return jsonError("Too many requests. Please try again later.", 429);
    }

    // Session handling. NOTE: the OTP gate only exists for offers with no
    // document_content (see GET /api/offers/public/[token] — `gate: "otp"`);
    // offers WITH a document render the native typed-name flow and never issue a
    // code. Requiring a session unconditionally therefore made every real offer
    // letter unsignable, so the requirement is scoped to the OTP-gated case.
    // A session that IS present must always belong to this offer (checked below).
    const sessionJwt = readOfferPublicSessionCookie(request.headers.get("cookie"));
    const session = sessionJwt ? verifyOfferPublicSession(sessionJwt) : null;

    const parsedBody = await parseJsonBody(request, "POST /api/offers/public/[token]/sign");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = bodySchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const signerName = parsed.data.signer_name.trim();
    const ua = (request.headers.get("user-agent") ?? "").slice(0, 500);

    const admin = createSupabaseAdmin();
    const { data: offer, error } = await admin
      .from("offers")
      .select(
        "id, status, signing_status, expires_at, organisation_id, application_id, role_title, document_content, document_hash, created_by, compensation_json, public_token, applications(candidate_id)",
      )
      .eq("public_token", token)
      .maybeSingle();

    if (error || !offer) return jsonError("Offer link not found", 404);

    // A session, when present, must belong to THIS offer — otherwise a valid
    // session for one offer could sign another whose public token the caller holds.
    if (session && session.offerId !== (offer.id as string)) {
      return jsonError("Verify the code sent to you before signing.", 401);
    }
    // OTP-gated offers (no document body) must have completed verification.
    const requiresOtpSession = !((offer.document_content as string | null) ?? "").trim();
    if (requiresOtpSession && !session) {
      return jsonError("Verify the code sent to you before signing.", 401);
    }

    const now = Date.now();
    const expiresAt = offer.expires_at as string | null;
    if (expiresAt && new Date(expiresAt).getTime() < now) {
      return jsonError("Offer has expired", 400);
    }
    if ((offer.status as string) === "accepted" || offer.signing_status === "signed") {
      return jsonError("Already signed", 400);
    }
    if ((offer.status as string) === "declined" || offer.signing_status === "declined") {
      return jsonError("Offer was declined", 400);
    }
    if ((offer.status as string) === "expired" || offer.signing_status === "expired") {
      return jsonError("Offer has expired", 400);
    }
    if (offer.signing_status === "pending_company") {
      return jsonError("Offer is awaiting company signature", 409);
    }
    if ((offer.status as string) !== "sent") {
      return jsonError("Offer is not open for signing", 400);
    }
    const docHtml = offer.document_content as string | null;
    const docHash = (offer.document_hash as string | null) ?? "";
    if (!docHtml || !docHash) {
      return jsonError("This offer has no document on file. Ask the employer to resend it.", 409);
    }

    const { data: orgRow } = await admin
      .from("organisations")
      .select("name")
      .eq("id", offer.organisation_id as string)
      .maybeSingle();
    const companyName = (orgRow?.name as string | null) ?? "Company";

    const signedAt = new Date();
    const pdfBytes = await generateSignedOfferPdf({
      companyName,
      roleTitle: offer.role_title as string,
      documentHtml: docHtml,
      signerName,
      signedAt,
      signerIp: ip,
      signerUserAgent: ua,
      documentHash: docHash,
    });

    const ts = signedAt.getTime();
    const storagePath = `signed-offers/${offer.id as string}/${ts}-signed.pdf`;
    const { error: upErr } = await admin.storage
      .from("signed-offers")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (upErr) {
      logger.error("offer sign: storage upload failed", { error: upErr.message });
      return jsonError("Could not store signed PDF", 500);
    }

    const signedAtIso = signedAt.toISOString();
    const { data: updated, error: updErr } = await admin
      .from("offers")
      .update({
        status: "accepted",
        signing_status: "signed",
        signed_at: signedAtIso,
        responded_at: signedAtIso,
        signer_name: signerName,
        signer_ip: ip,
        signer_user_agent: ua,
        signed_pdf_path: storagePath,
      })
      .eq("id", offer.id as string)
      .eq("status", "sent")
      .select("application_id")
      .maybeSingle();

    if (updErr || !updated) {
      return jsonError("Already signed", 400);
    }

    await recordHiringOfferAuditEvent({
      organisationId: offer.organisation_id as string,
      entityType: "offer",
      entityId: offer.id as string,
      eventType: "OFFER_ACCEPTED",
      actorProfileId: null,
      actorRole: "candidate_public",
      prevStatus: "sent",
      newStatus: "accepted",
      decision: "native_sign",
      comments: signerName,
      ipAddress: ip,
      channel: "email_link",
      metadata: { signer_name: signerName },
    });

    await upsertSignedOfferDocumentVersion(admin, offer.id as string, storagePath, signedAtIso);

    const candRow = offer.applications as { candidate_id?: string } | null;
    const candidateId = candRow?.candidate_id as string | undefined;
    let candidateEmail = "";
    let candidateDisplay = "Candidate";
    let candidateUserId: string | null = null;
    if (candidateId) {
      const { data: cand } = await admin
        .from("candidates")
        .select("email, name, full_name, user_id")
        .eq("id", candidateId)
        .maybeSingle();
      candidateEmail = ((cand?.email as string | null) ?? "").trim();
      candidateDisplay =
        ((cand?.full_name as string | null) ?? "").trim() ||
        ((cand?.name as string | null) ?? "").trim() ||
        "Candidate";
      candidateUserId = (cand?.user_id as string | null) ?? null;
    }

    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");
    const safeName = candidateDisplay.replace(/[^\w.-]+/g, "_").slice(0, 60);
    const pdfFilename = `offer-${safeName}-signed.pdf`;

    const deliveryReceipt = await sendNativeSignedOfferEmailsWithPdf({
      admin,
      candidateEmail,
      candidateName: candidateDisplay,
      roleTitle: offer.role_title as string,
      companyName,
      createdByProfileId: (offer.created_by as string | null) ?? null,
      pdfBase64,
      pdfFilename,
    });

    await insertOfferEvent(admin, {
      offerId: offer.id as string,
      eventType: "signed",
      actorIp: ip,
      actorUserAgent: ua,
      actorName: signerName,
      metadata: {
        signer_name: signerName,
        email_delivery: {
          candidate: {
            sent: deliveryReceipt.candidate.sent,
            skipped: deliveryReceipt.candidate.skipped,
            reason: deliveryReceipt.candidate.reason,
            recipient: deliveryReceipt.candidate.recipient,
            provider_message_id: deliveryReceipt.candidate.providerMessageId,
            error: deliveryReceipt.candidate.error,
          },
          recruiter: {
            sent: deliveryReceipt.recruiter.sent,
            skipped: deliveryReceipt.recruiter.skipped,
            reason: deliveryReceipt.recruiter.reason,
            recipient: deliveryReceipt.recruiter.recipient,
            provider_message_id: deliveryReceipt.recruiter.providerMessageId,
            error: deliveryReceipt.recruiter.error,
          },
        },
      },
    });

    if (candidateUserId) {
      await createNotification({
        userId: candidateUserId,
        type: "application_update",
        title: "Offer accepted",
        body: "Your signed offer letter was emailed to you as a PDF.",
        link: "/candidate/applications",
        metadata: { offerId: offer.id as string },
      });
    }

    const applicationId = updated.application_id as string | undefined;
    if (applicationId) {
      await syncPipelineOnNativeOfferAccepted(admin, {
        organisationId: offer.organisation_id as string,
        applicationId,
        offerId: offer.id as string,
        compensationJson: (offer.compensation_json as Record<string, unknown> | null) ?? null,
      });

      if (candidateId) {
        // Durable post-response enqueue so a frozen instance can't drop BGV. (#349)
        enqueueAfterResponse(
          "offer-bgv-trigger",
          {
            offerId: offer.id as string,
            organisationId: offer.organisation_id as string,
            candidateId,
            applicationId,
          },
          { id: `offer-bgv-trigger:${offer.id as string}` },
        );
      }
      triggerOrganisationOutboundEvent({
        organisationId: offer.organisation_id as string,
        eventType: "offer.signed",
        data: {
          offerId: offer.id,
          applicationId,
          candidateId: candidateId ?? null,
        },
      });
    }

    return jsonSuccess({ success: true, signed_at: signedAtIso });
  } catch (err) {
    return handleApiError(err, "Failed to sign offer", {
      route: "POST /api/offers/public/[token]/sign",
    });
  }
}
