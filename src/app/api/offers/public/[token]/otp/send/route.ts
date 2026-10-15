import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import {
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { allowsPublicOtpFlow } from "@/lib/offers/offer-public-gate";
import {
  generateOfferPublicOtpCode,
  hashOfferPublicOtp,
  offerPublicOtpExpiresAtIso,
} from "@/lib/offers/offer-public-link";
import { sendEmail, shouldSendEmail } from "@/lib/services/resend";
import { logger } from "@/lib/observability/logger";

const bodySchema = z.object({
  email: z.string().email(),
});

/**
 * POST /api/offers/public/[token]/otp/send — public; does not reveal whether the email matches.
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
    key: `offer-pub-otp-send:${ip}:${(token ?? "").slice(0, 12)}`,
    limit: 10,
    windowSecs: 60,
  });
  if (!rl.allowed) {
    return jsonError("Too many requests. Please try again later.", 429);
  }

  try {
    const parsedBody = await parseJsonBody(request, "POST /api/offers/public/[token]/otp/send");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = bodySchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const emailNorm = parsed.data.email.trim().toLowerCase();
    const admin = createSupabaseAdmin();

    const { data: offer, error } = await admin
      .from("offers")
      .select("id, status, expires_at, applications(candidate_id)")
      .eq("public_token", token)
      .maybeSingle();

    if (
      error ||
      !offer ||
      !allowsPublicOtpFlow(offer.status as string, offer.expires_at as string | null)
    ) {
      return jsonSuccess({ sent: true });
    }

    const candidate = offer.applications as { candidate_id?: string } | null;
    if (!candidate?.candidate_id) {
      return jsonSuccess({ sent: true });
    }

    const { data: cand } = await admin
      .from("candidates")
      .select("user_id")
      .eq("id", candidate.candidate_id)
      .single();
    const userId = cand?.user_id as string | undefined;
    if (!userId) {
      return jsonSuccess({ sent: true });
    }

    const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
    if (authErr || !authUser?.user?.email) {
      return jsonSuccess({ sent: true });
    }

    const accountEmail = authUser.user.email.trim().toLowerCase();
    if (accountEmail !== emailNorm) {
      return jsonSuccess({ sent: true });
    }

    const code = generateOfferPublicOtpCode();
    const hash = hashOfferPublicOtp(offer.id as string, code);
    const expiresAt = offerPublicOtpExpiresAtIso();

    const { error: upErr } = await admin
      .from("offers")
      .update({
        public_token_otp: hash,
        public_token_otp_expires_at: expiresAt,
        // Reset the brute-force counter for the freshly issued code so a prior
        // lockout doesn't persist across a legitimate re-request. (#352)
        public_token_otp_attempts: 0,
      })
      .eq("id", offer.id as string);

    if (upErr) {
      logger.warn("offer public otp send: failed to store OTP", { error: upErr.message });
      return jsonSuccess({ sent: true });
    }

    const allow = await shouldSendEmail(accountEmail, "application_updates");
    if (!allow) {
      return jsonSuccess({ sent: true });
    }

    const sendResult = await sendEmail({
      to: accountEmail,
      subject: "Your TigerHire offer verification code",
      html: `<p>Your verification code is <strong>${code}</strong>. It expires in 15 minutes.</p><p>If you did not request this, you can ignore this email.</p>`,
    });

    // Signing now requires a verified OTP session, so a swallowed send failure
    // would strand the candidate: told the code was sent, never receives it, and
    // unable to sign. Surface it instead.
    if (sendResult?.error) {
      logger.error("offer_otp_send_failed", {
        error: String(sendResult.error.message ?? sendResult.error),
      });
      return jsonError(
        "We couldn't send your verification code. Please contact the hiring team.",
        502,
      );
    }

    return jsonSuccess({ sent: true });
  } catch (err) {
    return handleApiError(err, "Failed to send offer OTP", {
      route: "POST /api/offers/public/[token]/otp/send",
    });
  }
}
