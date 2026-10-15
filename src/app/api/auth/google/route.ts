import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/config/env";
import {
  checkRateLimit,
  getClientIpForRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security/rate-limit";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

const OAUTH_STATE_COOKIE = "oauth_state_nonce";

/**
 * GET /api/auth/google
 * Start Google OAuth with redirect_uri on our domain so the consent screen
 * shows "tigerhire.io" instead of the Supabase URL.
 * Query: redirect_to (optional) — path after sign-in; flow=public (optional) — candidate / public referral sign-up (same as POST /api/auth/sso with flow: public).
 *
 * Includes a cryptographic nonce in the state parameter, stored in an
 * HTTP-only cookie, to prevent OAuth CSRF attacks.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIpForRateLimit(request);
  const rl = await checkRateLimit({ key: `auth:google:${ip}`, ...RATE_LIMIT_PRESETS.auth });
  if (!rl.allowed) {
    return NextResponse.redirect(new URL("/login?error=rate_limited", request.url));
  }

  const clientId = env.googleClientId?.trim() ?? "";
  const clientSecret = env.googleClientSecret?.trim() ?? "";
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?error=google_not_configured", request.url));
  }

  const { searchParams } = new URL(request.url);
  const redirectTo = searchParams.get("redirect_to")?.replace(/^https?:\/\/[^/]+/, "") || "/";
  const publicFlow = searchParams.get("flow");
  // Ensure path is relative and safe
  const safePath = redirectTo.startsWith("/") ? redirectTo : `/${redirectTo}`;
  const nonce = crypto.randomBytes(32).toString("hex");
  const statePayload: { redirect_to: string; flow?: "public"; nonce: string } = {
    redirect_to: safePath,
    nonce,
  };
  if (publicFlow === "public") {
    statePayload.flow = "public";
  }
  const state = Buffer.from(JSON.stringify(statePayload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const origin = new URL(request.url).origin;
  const callbackUrl = `${origin}/api/auth/callback/google`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: SCOPES,
    state,
    access_type: "offline",
    prompt: "consent",
  });

  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const url = `${GOOGLE_AUTH_URL}?${params.toString()}`;
  return NextResponse.redirect(url);
}
