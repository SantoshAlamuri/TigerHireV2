import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import {
  checkRateLimit,
  getClientIpForRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security/rate-limit";
import { completeOAuthSessionRedirect } from "@/lib/auth/oauth-session-completion";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Must match the cookie set by the OAuth start route (src/app/api/auth/google/route.ts).
const OAUTH_STATE_COOKIE = "oauth_state_nonce";

type GoogleOAuthState = {
  redirect_to?: string;
  flow?: "public";
  nonce?: string;
};

/**
 * Constant-time comparison of two nonce strings. Returns false on length
 * mismatch (timingSafeEqual throws when buffer lengths differ).
 */
function noncesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseState(param: string | null): GoogleOAuthState | null {
  if (!param) return null;
  try {
    const pad = param.length % 4 === 0 ? param : param + "===".slice(0, 4 - (param.length % 4));
    const json = Buffer.from(pad.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as GoogleOAuthState;
  } catch {
    return null;
  }
}

/**
 * GET /api/auth/callback/google
 * Receives the Google auth code, exchanges it for tokens, and signs the user in via
 * `signInWithIdToken` (no hop through the Supabase project domain), so the Google
 * consent screen can show your TigerHire / OAuth app branding.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIpForRateLimit(request);
  const rl = await checkRateLimit({
    key: `auth:google-callback:${ip}`,
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
  const err = searchParams.get("error");
  if (err) {
    const origin =
      process.env.NODE_ENV === "production"
        ? env.baseUrl || new URL(request.url).origin
        : new URL(request.url).origin;
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(err)}`, origin));
  }

  const code = searchParams.get("code");
  const state = parseState(searchParams.get("state"));
  if (!code || !state) {
    const o = new URL(request.url);
    return NextResponse.redirect(
      new URL(
        "/login?error=missing_code",
        process.env.NODE_ENV === "production" ? env.baseUrl || o.origin : o.origin,
      ),
    );
  }

  const origin =
    process.env.NODE_ENV === "production"
      ? env.baseUrl || new URL(request.url).origin
      : new URL(request.url).origin;

  // OAuth CSRF protection: the start route puts a random nonce in both the
  // `state` payload and an HTTP-only cookie. Fail closed unless they match.
  const cookieStore = await cookies();
  const cookieNonce = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  if (!cookieNonce || !state.nonce || !noncesMatch(state.nonce, cookieNonce)) {
    logger.warn("Google callback: OAuth state nonce validation failed", {
      hasCookie: Boolean(cookieNonce),
      hasStateNonce: Boolean(state.nonce),
    });
    cookieStore.delete(OAUTH_STATE_COOKIE);
    return NextResponse.redirect(new URL("/login?error=invalid_state", origin));
  }
  // Single-use: clear the nonce cookie once validated.
  cookieStore.delete(OAUTH_STATE_COOKIE);

  const clientId = env.googleClientId?.trim() ?? "";
  const clientSecret = env.googleClientSecret?.trim() ?? "";
  if (!clientId || !clientSecret) {
    logger.error("Google callback: missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in app env");
    return NextResponse.redirect(new URL("/login?error=google_not_configured", origin));
  }

  const callbackUrl = `${origin}/api/auth/callback/google`;
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl,
      grant_type: "authorization_code",
    }),
  });
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
    id_token?: string;
    access_token?: string;
    error?: string;
  };

  if (!tokenRes.ok || !tokenJson.id_token) {
    logger.error("Google token exchange failed", {
      status: tokenRes.status,
      error: tokenJson.error,
    });
    return NextResponse.redirect(new URL("/login?error=auth_failed", origin));
  }

  const supabase = await createSupabaseServerClient();
  const idToken = tokenJson.id_token;
  const signInParams: { provider: "google"; token: string; access_token?: string } = {
    provider: "google",
    token: idToken,
  };
  if (tokenJson.access_token) {
    signInParams.access_token = tokenJson.access_token;
  }
  const { data: sessionData, error: signInErr } =
    await supabase.auth.signInWithIdToken(signInParams);

  if (signInErr || !sessionData.user) {
    logger.error("signInWithIdToken failed", {
      error: signInErr?.message,
    });
    return NextResponse.redirect(new URL("/login?error=auth_failed", origin));
  }

  const rawNext = state.redirect_to?.startsWith("/") ? state.redirect_to : "/";
  const next = !rawNext.startsWith("//") ? rawNext : "/";
  const isPublicOauthFlow = state.flow === "public" || next.startsWith("/refer/join");

  return completeOAuthSessionRedirect({
    supabase,
    user: sessionData.user,
    next,
    isPublicOauthFlow: Boolean(isPublicOauthFlow),
    origin,
  });
}
