import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { completeOAuthSessionRedirect } from "@/lib/auth/oauth-session-completion";
import {
  checkRateLimit,
  getClientIpForRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security/rate-limit";

export async function GET(request: NextRequest) {
  const ip = getClientIpForRateLimit(request);
  const rl = await checkRateLimit({
    key: `auth:callback-oauth:${ip}`,
    ...RATE_LIMIT_PRESETS.default,
  });
  if (!rl.allowed) {
    const o = new URL(request.url);
    return NextResponse.redirect(
      new URL(
        "/login?error=rate_limited",
        process.env.NODE_ENV === "production" ? env.baseUrl || o.origin : o.origin,
      ),
    );
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const oauthFlow = searchParams.get("flow");
  const isPublicOauthFlow = oauthFlow === "public" || next.startsWith("/refer/join");
  const origin =
    process.env.NODE_ENV === "production"
      ? env.baseUrl || new URL(request.url).origin
      : new URL(request.url).origin;

  if (errorParam) {
    logger.error("OAuth provider returned error", {
      error: errorParam,
      description: errorDescription,
    });
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorParam)}`, origin));
  }

  if (!code) {
    // Password-reset links use Supabase's implicit flow: the session rides in
    // the URL hash fragment, which browsers never send to the server, so there
    // is no code to exchange. Hand the browser to the reset page — the fragment
    // survives the redirect and the page establishes the session from it.
    if (next === "/reset-password") {
      return NextResponse.redirect(new URL("/reset-password", origin));
    }
    return NextResponse.redirect(new URL("/login?error=missing_code", origin));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    logger.error("Code exchange failed", {
      error: error?.message,
      code: error?.code,
      status: error?.status,
    });
    const failTarget = next === "/reset-password" ? "/forgot-password" : "/login";
    return NextResponse.redirect(new URL(`${failTarget}?error=auth_failed`, origin));
  }

  if (next === "/reset-password") {
    return NextResponse.redirect(new URL("/reset-password", origin));
  }

  return completeOAuthSessionRedirect({
    supabase,
    user: data.user,
    next,
    isPublicOauthFlow,
    origin,
  });
}
