import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import { parseJsonBody, jsonError, handleZodError, handleApiError } from "@/lib/api-helpers";
import { env } from "@/lib/config/env";
import { allowsPublicOtpFlow } from "@/lib/offers/offer-public-gate";
import {
  OFFER_PUBLIC_SESSION_COOKIE,
  signOfferPublicSession,
  verifyOfferPublicOtpHash,
} from "@/lib/offers/offer-public-link";
import { buildPublicOfferSummary } from "@/lib/offers/offer-public-summary";
import { logger } from "@/lib/observability/logger";

const bodySchema = z.object({
  otp_code: z.string().min(6, "Code is required").max(32),
});

/**
 * POST /api/offers/public/[token]/otp/verify — sets httpOnly session cookie on success.
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
    key: `offer-pub-otp-verify:${ip}:${(token ?? "").slice(0, 12)}`,
    limit: 20,
    windowSecs: 60,
  });
  if (!rl.allowed) {
    return jsonError("Too many requests. Please try again later.", 429);
  }

  try {
    const parsedBody = await parseJsonBody(request, "POST /api/offers/public/[token]/otp/verify");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = bodySchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const { data: offer, error } = await admin
      .from("offers")
      .select(
        "id, status, expires_at, organisation_id, role_title, start_date, compensation_json, notes, document_content, public_token, public_token_otp, public_token_otp_expires_at, public_token_otp_attempts, public_token_viewed_at, applications(candidate_id)",
      )
      .eq("public_token", token)
      .maybeSingle();

    if (error || !offer) {
      return jsonError("Invalid code or offer.", 401);
    }

    if (!allowsPublicOtpFlow(offer.status as string, offer.expires_at as string | null)) {
      return jsonError("Invalid code or offer.", 401);
    }

    const storedHash = offer.public_token_otp as string | null;
    const exp = offer.public_token_otp_expires_at as string | null;
    if (!storedHash || !exp || new Date(exp).getTime() < Date.now()) {
      return jsonError("Invalid or expired code.", 401);
    }

    // Per-offer brute-force lockout: a 6-digit OTP with only an IP rate limit was
    // guessable within the 15-min TTL (and the IP key is client-controllable). Cap
    // failed attempts per offer and invalidate the OTP once the cap is hit. (#352)
    const MAX_OTP_ATTEMPTS = 5;
    const attempts = Number(offer.public_token_otp_attempts ?? 0) || 0;
    if (attempts >= MAX_OTP_ATTEMPTS) {
      await admin
        .from("offers")
        .update({ public_token_otp: null, public_token_otp_expires_at: null })
        .eq("id", offer.id as string);
      return jsonError("Too many attempts. Please request a new code.", 429);
    }

    if (!verifyOfferPublicOtpHash(storedHash, offer.id as string, parsed.data.otp_code)) {
      const nextAttempts = attempts + 1;
      const failUpdate: Record<string, unknown> = { public_token_otp_attempts: nextAttempts };
      // On the final allowed miss, invalidate the code so it can't be guessed further.
      if (nextAttempts >= MAX_OTP_ATTEMPTS) {
        failUpdate.public_token_otp = null;
        failUpdate.public_token_otp_expires_at = null;
      }
      await admin
        .from("offers")
        .update(failUpdate)
        .eq("id", offer.id as string);
      return jsonError("Invalid or expired code.", 401);
    }

    const candidate = offer.applications as { candidate_id?: string } | null;
    if (!candidate?.candidate_id) {
      return jsonError("Invalid code or offer.", 401);
    }

    const { data: cand } = await admin
      .from("candidates")
      .select("user_id")
      .eq("id", candidate.candidate_id)
      .single();
    const candidateUserId = cand?.user_id as string | undefined;
    if (!candidateUserId) {
      return jsonError("Invalid code or offer.", 401);
    }

    const nowIso = new Date().toISOString();
    const updates: Record<string, unknown> = {
      public_token_otp: null,
      public_token_otp_expires_at: null,
      public_token_otp_attempts: 0,
    };
    if (!offer.public_token_viewed_at) {
      updates.public_token_viewed_at = nowIso;
    }

    const { error: clearErr } = await admin
      .from("offers")
      .update(updates)
      .eq("id", offer.id as string);
    if (clearErr) {
      logger.warn("offer public otp verify: clear OTP failed", { error: clearErr.message });
      return jsonError("Verification failed.", 500);
    }

    const { data: orgRow } = await admin
      .from("organisations")
      .select("name")
      .eq("id", offer.organisation_id as string)
      .maybeSingle();
    const companyName = (orgRow?.name as string | null) ?? null;

    const jwt = signOfferPublicSession(offer.id as string, candidateUserId);
    const out = NextResponse.json(
      { summary: buildPublicOfferSummary(offer as Record<string, unknown>, companyName) },
      { status: 200 },
    );
    out.cookies.set(OFFER_PUBLIC_SESSION_COOKIE, jwt, {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 2 * 60 * 60,
    });
    return out;
  } catch (err) {
    return handleApiError(err, "Failed to verify offer OTP", {
      route: "POST /api/offers/public/[token]/otp/verify",
    });
  }
}
