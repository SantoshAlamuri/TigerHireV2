import { NextRequest, NextResponse } from "next/server";
import { attachCsrfToken } from "@/lib/security/csrf";
import { CSRF_COOKIE_NAME } from "@/lib/security/csrf-constants";
import { incrementAuthCsrfTokenIssued } from "@/lib/observability/auth-csrf-metrics";
import {
  checkRateLimit,
  getClientIpForRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security/rate-limit";

/**
 * GET /api/auth/csrf-token
 * Issues (or refreshes) the CSRF cookie used for double-submit protection.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIpForRateLimit(request);
  const rl = await checkRateLimit({ key: `auth:csrf:${ip}`, ...RATE_LIMIT_PRESETS.default });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  incrementAuthCsrfTokenIssued();
  const response = NextResponse.json(
    {
      ok: true,
      tokenCookie: CSRF_COOKIE_NAME,
    },
    { status: 200 },
  );
  return attachCsrfToken(response, request);
}
