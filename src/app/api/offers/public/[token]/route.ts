import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { jsonError, jsonSuccess, handleApiError } from "@/lib/api-helpers";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  allowsPublicOtpFlow,
  isOfferDeadForPublicPage,
  isOfferExpiredClock,
  publicOfferStatusLabel,
} from "@/lib/offers/offer-public-gate";
import { buildPublicOfferSummary } from "@/lib/offers/offer-public-summary";
import {
  readOfferPublicSessionCookie,
  verifyOfferPublicSession,
} from "@/lib/offers/offer-public-link";

/**
 * GET /api/offers/public/[token] — bootstrap public native offer page (no auth).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token || token.length < 16) {
      return jsonError("Offer link not found", 404);
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const rl = await checkRateLimit({
      key: `offer-pub-get:${ip}:${token.slice(0, 12)}`,
      limit: 120,
      windowSecs: 60,
    });
    if (!rl.allowed) {
      return jsonError("Too many requests. Please try again later.", 429);
    }

    const admin = createSupabaseAdmin();
    const { data: offer, error } = await admin
      .from("offers")
      .select(
        "id, status, signing_status, expires_at, organisation_id, role_title, start_date, compensation_json, notes, document_content, signed_at, signer_name, declined_at, decline_reason, public_token",
      )
      .eq("public_token", token)
      .maybeSingle();

    if (error || !offer) {
      return jsonError("Offer link not found", 404);
    }

    const { data: orgRow } = await admin
      .from("organisations")
      .select("name")
      .eq("id", offer.organisation_id as string)
      .maybeSingle();
    const companyName = (orgRow?.name as string | null) ?? null;

    const status = offer.status as string;
    const signingStatus = offer.signing_status as string | null;
    const expiresAt = offer.expires_at as string | null;
    const expiredClock = isOfferExpiredClock(expiresAt);
    const signingExpired = signingStatus === "expired";

    if (signingStatus === "withdrawn" || status === "withdrawn") {
      return jsonSuccess({
        gate: "dead" as const,
        statusLabel: publicOfferStatusLabel("withdrawn"),
        message: `This offer has been withdrawn.${companyName ? ` Please contact ${companyName} for assistance.` : ""}`,
      });
    }
    if (signingStatus === "pending_company") {
      return jsonSuccess({
        gate: "dead" as const,
        statusLabel: "Awaiting company signature",
        message:
          "This offer will be available after the company representative completes the first signature.",
      });
    }

    if (status === "accepted" || signingStatus === "signed") {
      return jsonSuccess({
        gate: "signed" as const,
        companyName,
        roleTitle: offer.role_title as string,
        signerName: (offer.signer_name as string | null) ?? "Candidate",
        signedAt: (offer.signed_at as string | null) ?? null,
        downloadUrl: `/api/offers/public/${token}/download`,
      });
    }

    if (status === "declined" || signingStatus === "declined") {
      return jsonSuccess({
        gate: "dead" as const,
        statusLabel: "Declined",
        message: "You have already declined this offer.",
      });
    }

    if (signingExpired || status === "expired" || expiredClock) {
      return jsonSuccess({
        gate: "dead" as const,
        statusLabel: publicOfferStatusLabel("expired"),
        message: companyName
          ? `This offer link has expired. Please contact ${companyName} for assistance.`
          : "This offer link has expired. Please contact the employer for assistance.",
      });
    }

    if (isOfferDeadForPublicPage(status, expiresAt, signingStatus)) {
      const eff = expiredClock ? "expired" : status;
      let message = "This offer is no longer available through this link.";
      if (eff === "expired") {
        message = companyName
          ? `This offer link has expired. Please contact ${companyName} for assistance.`
          : "This offer link has expired. Please contact the employer for assistance.";
      } else if (eff === "accepted") message = "This offer has already been accepted.";
      else if (eff === "declined") message = "This offer was declined.";
      return jsonSuccess({
        gate: "dead" as const,
        statusLabel: publicOfferStatusLabel(eff),
        message,
      });
    }

    if (status !== "sent") {
      return jsonSuccess({
        gate: "dead" as const,
        statusLabel: publicOfferStatusLabel(status),
        message: "This offer is not available for viewing here.",
      });
    }

    const doc = (offer.document_content as string | null) ?? "";
    if (!doc.trim()) {
      const cookieJwt = readOfferPublicSessionCookie(request.headers.get("cookie"));
      const session = cookieJwt ? verifyOfferPublicSession(cookieJwt) : null;
      if (session && session.offerId === offer.id) {
        return jsonSuccess({
          gate: "view" as const,
          summary: buildPublicOfferSummary(offer as Record<string, unknown>, companyName),
        });
      }
      if (!allowsPublicOtpFlow(status, expiresAt)) {
        return jsonSuccess({
          gate: "dead" as const,
          statusLabel: publicOfferStatusLabel(status),
          message: "This offer is not available for viewing here.",
        });
      }
      return jsonSuccess({
        gate: "otp" as const,
        roleTitle: offer.role_title as string,
        companyName,
        statusLabel: publicOfferStatusLabel(status),
      });
    }

    return jsonSuccess({
      gate: "native" as const,
      companyName,
      roleTitle: offer.role_title as string,
      documentHtml: doc,
      expiresAt,
      signingStatus: signingStatus ?? "sent",
      statusLabel: publicOfferStatusLabel("sent"),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load public offer", {
      route: "GET /api/offers/public/[token]",
    });
  }
}
