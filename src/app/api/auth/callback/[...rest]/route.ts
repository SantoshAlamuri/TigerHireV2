import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import {
  checkRateLimit,
  getClientIpForRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security/rate-limit";

/**
 * Catch-all for /api/auth/callback/* (e.g. /api/auth/callback/google).
 * Redirects to /api/auth/callback with the same query string so the main
 * callback handler runs. Supabase OAuth uses redirectTo=/api/auth/callback;
 * this ensures any variant (e.g. callback/google) still hits the same handler.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIpForRateLimit(request);
  const rl = await checkRateLimit({
    key: `auth:callback-redirect:${ip}`,
    ...RATE_LIMIT_PRESETS.default,
  });
  if (!rl.allowed) {
    return NextResponse.redirect(new URL("/login?error=rate_limited", request.url));
  }

  const { searchParams } = new URL(request.url);
  const baseUrl =
    process.env.NODE_ENV === "production"
      ? env.baseUrl || new URL(request.url).origin
      : new URL(request.url).origin;
  const callbackUrl = new URL("/api/auth/callback", baseUrl);
  searchParams.forEach((value, key) => callbackUrl.searchParams.set(key, value));
  return NextResponse.redirect(callbackUrl);
}
