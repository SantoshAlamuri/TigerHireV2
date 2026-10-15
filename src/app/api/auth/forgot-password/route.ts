import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { env } from "@/lib/config/env";
import { parseJsonBody, jsonError, jsonSuccess, handleZodError } from "@/lib/api-helpers";
import { reportError } from "@/lib/observability/report-error";
import { logger } from "@/lib/observability/logger";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rate-limit";
import {
  shouldEnforceAuthCsrfToken,
  startAuthCsrfIssuerProbe,
  validateOrigin,
} from "@/lib/security/csrf";
import { reservePasswordResetCooldown } from "@/lib/security/auth-throttle";
import { incrementAuthRequestTotal } from "@/lib/observability/auth-csrf-metrics";

/**
 * Stateless Supabase client — does NOT read browser cookies. Stale session
 * cookies (e.g. after closing the browser without logout) would otherwise
 * pollute GoTrue state and can prevent the reset email from being sent.
 */
function createStatelessSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) are required.",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  incrementAuthRequestTotal("forgot-password");
  startAuthCsrfIssuerProbe(request);
  const csrf = validateOrigin(request, { requireToken: shouldEnforceAuthCsrfToken() });
  if (csrf) return csrf;

  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const rl = await checkRateLimit({
      key: `forgot-pw:${ip}`,
      ...RATE_LIMIT_PRESETS.auth,
    });
    if (!rl.allowed) return jsonError("Too many requests. Please wait a minute.", 429);

    const parsedBody = await parseJsonBody(request, "POST /api/auth/forgot-password");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = forgotPasswordSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const email = parsed.data.email.trim().toLowerCase();
    const cooldown = await reservePasswordResetCooldown(email);
    if (!cooldown.allowed) {
      return jsonError(
        "If an account exists with that email, you can request another reset link in a few minutes.",
        429,
      );
    }
    const supabase = createStatelessSupabaseClient();

    // Always use the configured base URL in production — never trust the Origin
    // header for constructing redirect URLs (attacker could set a malicious origin).
    // In dev, use request origin so reset links point to localhost.
    const origin =
      process.env.NODE_ENV === "production" ? env.baseUrl : new URL(request.url).origin;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/api/auth/callback?next=/reset-password`,
    });

    if (error) {
      // Log the full error server-side for debugging (e.g. SMTP not configured)
      logger.error("Password reset email failed", {
        route: "/api/auth/forgot-password",
        errorMessage: error.message,
        errorStatus: error.status,
        emailDomain: email.includes("@") ? email.split("@")[1] : "",
      });
      reportError(error, { route: "/api/auth/forgot-password" });

      // Surface rate-limit errors — they don't reveal whether the email exists
      if (error.message.toLowerCase().includes("rate limit")) {
        return jsonError(
          "Too many email requests. Please wait a few minutes before trying again.",
          429,
        );
      }
      // Don't return generic success if Supabase itself errored — the email
      // was NOT sent. Return a user-actionable message without leaking details.
      return jsonError(
        "We were unable to send the reset email. Please try again later or contact support.",
        500,
      );
    }

    logger.info("Password reset email sent", {
      emailDomain: email.includes("@") ? email.split("@")[1] : "",
    });

    return jsonSuccess({
      message:
        "If an account exists with that email, you will receive a password reset link shortly.",
    });
  } catch (err) {
    reportError(err, { route: "/api/auth/forgot-password" });
    return jsonError("Something went wrong. Please try again.", 500);
  }
}
