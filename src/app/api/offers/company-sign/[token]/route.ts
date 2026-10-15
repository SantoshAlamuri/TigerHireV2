import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/services/notifications";
import { sendNativeOfferSigningInviteEmail } from "@/lib/offers/offer-native-notifications";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getRequestClientIp } from "@/lib/audit/client-ip";
import { insertOfferEvent } from "@/lib/offers/offer-events";
import { logger } from "@/lib/observability/logger";
import { jsonError, jsonSuccess, handleApiError, handleZodError } from "@/lib/api-helpers";
import { publicOfferStatusLabel } from "@/lib/offers/offer-public-gate";
import { env } from "@/lib/config/env";

const companySignBodySchema = z.object({
  signer_name: z.string().min(1).max(200),
});

/**
 * GET /api/offers/company-sign/[token] — bootstrap company signer page.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token || token.length < 16) return jsonError("Signature link not found", 404);

    const admin = createSupabaseAdmin();
    const { data: offer, error } = await admin
      .from("offers")
      .select(
        "id, status, signing_status, expires_at, organisation_id, role_title, document_content, company_signer_name, company_signed_at",
      )
      .eq("company_sign_token", token)
      .maybeSingle();

    if (error || !offer) return jsonError("Signature link not found", 404);

    const { data: orgRow } = await admin
      .from("organisations")
      .select("name")
      .eq("id", offer.organisation_id as string)
      .maybeSingle();
    const companyName = (orgRow?.name as string | null) ?? null;

    const status = offer.status as string;
    const signingStatus = (offer.signing_status as string | null) ?? null;
    const expiresAt = offer.expires_at as string | null;
    const isExpired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : false;

    if (status === "withdrawn" || signingStatus === "withdrawn") {
      return jsonSuccess({
        gate: "dead" as const,
        statusLabel: "Withdrawn",
        message: "This offer was withdrawn.",
      });
    }
    if (status === "expired" || signingStatus === "expired" || isExpired) {
      return jsonSuccess({
        gate: "dead" as const,
        statusLabel: publicOfferStatusLabel("expired"),
        message: "This offer has expired.",
      });
    }
    if (
      (offer.company_signed_at as string | null) ||
      signingStatus === "sent" ||
      signingStatus === "viewed"
    ) {
      return jsonSuccess({
        gate: "done" as const,
        message: "Company signature is already completed for this offer.",
      });
    }
    if (status === "accepted" || signingStatus === "signed") {
      return jsonSuccess({
        gate: "done" as const,
        message: "This offer is already fully signed.",
      });
    }
    if (status !== "sent" || signingStatus !== "pending_company") {
      return jsonSuccess({
        gate: "dead" as const,
        statusLabel: publicOfferStatusLabel(status),
        message: "This offer is not awaiting company signature.",
      });
    }

    const doc = ((offer.document_content as string | null) ?? "").trim();
    if (!doc) {
      return jsonSuccess({
        gate: "dead" as const,
        statusLabel: "Unavailable",
        message: "Offer document is missing. Please contact the hiring team.",
      });
    }

    return jsonSuccess({
      gate: "sign" as const,
      roleTitle: offer.role_title as string,
      companyName,
      signerName: ((offer.company_signer_name as string | null) ?? "").trim(),
      documentHtml: doc,
      expiresAt,
    });
  } catch (err) {
    return handleApiError(err, "Failed to load company sign page", {
      route: "GET /api/offers/company-sign/[token]",
    });
  }
}

/**
 * POST /api/offers/company-sign/[token] — company representative signature.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token || token.length < 16) return jsonError("Signature link not found", 404);

    const ip =
      getRequestClientIp(request) ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const rl = await checkRateLimit({
      key: `offer-company-sign:${ip}:${token.slice(0, 12)}`,
      limit: 20,
      windowSecs: 300,
    });
    if (!rl.allowed) return jsonError("Too many requests. Please try again later.", 429);

    const parsedBody = companySignBodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsedBody.success) return handleZodError(parsedBody.error);
    const signerName = parsedBody.data.signer_name.trim();
    const ua = (request.headers.get("user-agent") ?? "").slice(0, 500);
    const nowIso = new Date().toISOString();

    const admin = createSupabaseAdmin();
    const { data: offer, error } = await admin
      .from("offers")
      .select(
        "id, status, signing_status, expires_at, organisation_id, role_title, company_sign_token, company_signer_name, application_id, applications(candidate_id)",
      )
      .eq("company_sign_token", token)
      .maybeSingle();
    if (error || !offer) return jsonError("Signature link not found", 404);

    const expiresAt = offer.expires_at as string | null;
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      return jsonError("Offer has expired", 400);
    }
    if ((offer.status as string) !== "sent" || offer.signing_status !== "pending_company") {
      return jsonError("This offer is not awaiting company signature", 409);
    }

    const { data: updated, error: updErr } = await admin
      .from("offers")
      .update({
        signing_status: "sent",
        company_signed_at: nowIso,
        company_signer_name: signerName,
        company_signer_ip: ip,
        company_signer_user_agent: ua,
        company_sign_token: null,
        company_sign_requested_at: null,
      })
      .eq("id", offer.id as string)
      .eq("status", "sent")
      .eq("signing_status", "pending_company")
      .select("id")
      .maybeSingle();
    if (updErr || !updated) return jsonError("Signature already completed", 409);

    await insertOfferEvent(admin, {
      offerId: offer.id as string,
      eventType: "company_signed",
      actorIp: ip,
      actorUserAgent: ua,
      actorName: signerName,
    });

    const { data: orgRow } = await admin
      .from("organisations")
      .select("name")
      .eq("id", offer.organisation_id as string)
      .maybeSingle();
    const companyName = (orgRow?.name as string | null) ?? "Your organisation";

    const candRow = offer.applications as { candidate_id?: string } | null;
    const candidateId = candRow?.candidate_id as string | undefined;
    if (!candidateId) return jsonSuccess({ success: true, candidate_invite_sent: false });

    const { data: cand } = await admin
      .from("candidates")
      .select("email, name, full_name, user_id")
      .eq("id", candidateId)
      .maybeSingle();
    const candidateEmail = ((cand?.email as string | null) ?? "").trim();
    const candidateDisplay =
      ((cand?.full_name as string | null) ?? "").trim() ||
      ((cand?.name as string | null) ?? "").trim() ||
      "Candidate";
    const candidateUserId = (cand?.user_id as string | null) ?? null;

    const { data: freshOffer } = await admin
      .from("offers")
      .select("public_token")
      .eq("id", offer.id as string)
      .maybeSingle();
    const publicToken = ((freshOffer?.public_token as string | null) ?? "").trim();
    if (!publicToken || !candidateEmail) {
      return jsonSuccess({ success: true, candidate_invite_sent: false });
    }

    const publicOfferUrl = `${env.baseUrl}/offers/${publicToken}`;
    if (candidateUserId) {
      const ok = await createNotification({
        userId: candidateUserId,
        type: "application_update",
        title: "You have received an offer",
        body: `Review and sign your offer letter (no account required): ${publicOfferUrl}`,
        link: `/candidate/applications`,
        metadata: { offerId: offer.id as string, publicOfferUrl },
      });
      if (!ok) {
        logger.warn("createNotification failed after company sign", {
          offerId: offer.id as string,
          userId: candidateUserId,
        });
      }
    }

    await sendNativeOfferSigningInviteEmail({
      candidateEmail,
      candidateName: candidateDisplay,
      roleTitle: offer.role_title as string,
      companyName,
      publicToken,
    });

    return jsonSuccess({ success: true, candidate_invite_sent: true });
  } catch (err) {
    return handleApiError(err, "Failed to apply company signature", {
      route: "POST /api/offers/company-sign/[token]",
    });
  }
}
