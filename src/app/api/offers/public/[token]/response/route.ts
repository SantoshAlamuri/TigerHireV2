import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { offerResponseSchema } from "@/lib/validations/offers";
import { validateOrigin } from "@/lib/security/csrf";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getRequestClientIp } from "@/lib/audit/client-ip";
import {
  readOfferPublicSessionCookie,
  verifyOfferPublicSession,
} from "@/lib/offers/offer-public-link";
import { executeOfferCandidateResponse } from "@/lib/offers/offer-candidate-response";

/**
 * POST /api/offers/public/[token]/response — candidate response via OTP session cookie.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const { token } = await params;
  const rl = await checkRateLimit({
    key: `offer-pub-resp:${ip}:${(token ?? "").slice(0, 12)}`,
    limit: 30,
    windowSecs: 60,
  });
  if (!rl.allowed) {
    return jsonError("Too many requests. Please try again later.", 429);
  }

  try {
    const cookieJwt = readOfferPublicSessionCookie(request.headers.get("cookie"));
    const session = cookieJwt ? verifyOfferPublicSession(cookieJwt) : null;
    if (!session) {
      return jsonError("Unauthorized", 401);
    }

    const { body, errorResponse } = await parseJsonBody(
      request,
      "POST /api/offers/public/[token]/response",
    );
    if (errorResponse) return errorResponse;
    const parsed = offerResponseSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const { data: offer, error: oErr } = await admin
      .from("offers")
      .select("id, public_token")
      .eq("id", session.offerId)
      .maybeSingle();
    if (oErr || !offer || (offer.public_token as string) !== token) {
      return jsonError("Unauthorized", 401);
    }

    const result = await executeOfferCandidateResponse(admin, {
      offerId: session.offerId,
      body: parsed.data,
      candidateUserId: session.candidateUserId,
      actorProfileId: session.candidateUserId,
      actorRole: null,
      requestIp: getRequestClientIp(request),
      auditChannel: "api",
      auditMetadata: { source: "public_offer_link" },
      logRoute: "POST /api/offers/public/[token]/response",
    });

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }
    return jsonSuccess({ offer: result.offer });
  } catch (err) {
    return handleApiError(err, "Failed to submit offer response", {
      route: "POST /api/offers/public/[token]/response",
    });
  }
}
