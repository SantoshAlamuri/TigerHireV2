import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import { parseJsonBody, jsonError, jsonSuccess, handleZodError } from "@/lib/api-helpers";
import { sendReferrerOtp } from "@/lib/services/referrer-otp";
import { logger } from "@/lib/observability/logger";
import { env } from "@/lib/config/env";
import { normalizeReferrerWhatsapp } from "@/lib/referrers/normalize-whatsapp";

const bodySchema = z.object({
  whatsapp_number: z.string().min(1, "WhatsApp number is required").optional(),
  phone: z.string().min(1, "Phone is required").optional(),
});

/**
 * POST /api/refer/otp/send — public; does not reveal whether the number exists in `referrers`.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const parsedBody = await parseJsonBody(request, "POST /api/refer/otp/send");
  if (parsedBody.errorResponse) return parsedBody.errorResponse;

  const parsed = bodySchema.safeParse(parsedBody.body);
  if (!parsed.success) return handleZodError(parsed.error);

  const raw = (parsed.data.whatsapp_number ?? parsed.data.phone ?? "").trim();
  if (!raw) {
    return jsonError("WhatsApp number is required.", 400);
  }
  const normalizedPhone = normalizeReferrerWhatsapp(raw);
  if (normalizedPhone.length < 8) {
    return jsonError("Please enter a valid WhatsApp number.", 400);
  }

  const phoneRl = await checkRateLimit({
    key: `refer-otp-send:phone:${normalizedPhone}`,
    limit: env.referOtpSendPhoneLimit,
    windowSecs: env.referOtpSendPhoneWindowSecs,
  });
  if (!phoneRl.allowed) {
    return jsonError("Too many requests. Please try again later.", 429);
  }

  const ipRl = await checkRateLimit({
    key: `refer-otp-send:ip:${ip}`,
    limit: env.referOtpSendIpLimit,
    windowSecs: env.referOtpSendIpWindowSecs,
  });
  if (!ipRl.allowed) {
    return jsonError("Too many requests. Please try again later.", 429);
  }

  try {
    const supabase = createSupabaseAdmin();
    const result = await sendReferrerOtp(supabase, raw);
    if (!result.delivered) {
      logger.warn("refer/otp/send: delivery failed", {
        error: result.error ?? "unknown",
      });

      if (!env.isProduction) {
        return jsonSuccess({
          sent: true,
          debug_delivery_failed: true,
          debug_code: result.code,
          debug_error: result.error ?? "Unknown WhatsApp delivery error",
        });
      }

      return jsonError("Failed to send verification code.", 503);
    }

    if (!env.isProduction) {
      return jsonSuccess({ sent: true, debug_code: result.code });
    }
  } catch (err) {
    logger.warn("refer/otp/send: failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonError("Failed to send verification code.", 500);
  }

  return jsonSuccess({ sent: true });
}
