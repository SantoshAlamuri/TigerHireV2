import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import {
  getAuthContext,
  requireAuth,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
} from "@/lib/api-helpers";
import { verifyReferrerOtp } from "@/lib/services/referrer-otp";
import { normalizeReferrerWhatsapp } from "@/lib/referrers/normalize-whatsapp";
import { claimUnclaimedCandidateByPhone } from "@/lib/agents/candidate-dedup";
import { logger } from "@/lib/observability/logger";

const bodySchema = z.object({
  whatsapp_number: z.string().min(1, "WhatsApp number is required"),
  otp_code: z.string().min(6, "OTP code is required").max(32),
});

/**
 * POST /api/refer/otp/verify — requires session (`getAuthContext` + `requireAuth`); links referrer on success.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = await checkRateLimit({
    key: buildScopedRateLimitKey({
      route: "refer-otp-verify",
      userId: ctx.userId,
      suffix: ip,
    }),
    limit: 20,
    windowSecs: 60,
  });
  if (!rl.allowed) {
    return jsonError("Too many requests. Please try again later.", 429);
  }

  const parsedBody = await parseJsonBody(request, "POST /api/refer/otp/verify");
  if (parsedBody.errorResponse) return parsedBody.errorResponse;

  const parsed = bodySchema.safeParse(parsedBody.body);
  if (!parsed.success) return handleZodError(parsed.error);

  const { whatsapp_number, otp_code } = parsed.data;
  const raw = whatsapp_number.trim();
  if (!raw) {
    return jsonError("WhatsApp number is required.", 400);
  }

  const supabase = createSupabaseAdmin();
  let verified: boolean;
  try {
    verified = await verifyReferrerOtp(supabase, raw, otp_code);
  } catch (err) {
    logger.warn("refer/otp/verify: verifyReferrerOtp failed", {
      error: err instanceof Error ? err.message : String(err),
      userId: ctx.userId,
    });
    return jsonError("Verification failed.", 500);
  }

  if (verified) {
    const norm = normalizeReferrerWhatsapp(raw);
    const { error: linkErr } = await supabase
      .from("referrers")
      .update({ user_id: ctx.userId })
      .eq("whatsapp_number", norm)
      .is("user_id", null);

    if (linkErr) {
      logger.warn("refer/otp/verify: user_id link failed", {
        error: linkErr.message,
        userId: ctx.userId,
      });
      return jsonError("Verification failed.", 500);
    }

    // Phone now proven — claim any WhatsApp-origin candidate row keyed by this number
    // (the email-based auto-claim can't reach candidates that only have a phone).
    try {
      await claimUnclaimedCandidateByPhone(supabase, ctx.userId, norm);
    } catch (claimErr) {
      logger.warn("refer/otp/verify: candidate phone-claim failed (non-fatal)", {
        error: claimErr instanceof Error ? claimErr.message : String(claimErr),
        userId: ctx.userId,
      });
    }
  }

  return jsonSuccess({ verified });
}
