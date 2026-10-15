import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/observability/report-error";
import { validateOrigin } from "@/lib/security/csrf";
import {
  checkRateLimit,
  getClientIpForRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security/rate-limit";

/**
 * Logs auth failure details (Supabase error code/message) for debugging.
 * Called from client when signInWithPassword fails so production logs/Sentry get the real error.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIpForRateLimit(request);
  const rl = await checkRateLimit({ key: `auth:log-error:${ip}`, ...RATE_LIMIT_PRESETS.default });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const raw = await request.text();
    let body: Record<string, unknown> = {};
    if (raw.trim().length > 0) {
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        body = {};
      }
    }
    const code = typeof body?.code === "string" ? body.code : undefined;
    const message = typeof body?.message === "string" ? body.message : "Auth error";
    const emailDomain = typeof body?.emailDomain === "string" ? body.emailDomain : undefined;
    reportError(new Error(message), {
      route: "/api/auth/log-auth-error",
      authErrorCode: code,
      emailDomain,
    });
    return new Response(null, { status: 204 });
  } catch (err) {
    reportError(err, { route: "/api/auth/log-auth-error" });
    return new Response(null, { status: 204 });
  }
}
