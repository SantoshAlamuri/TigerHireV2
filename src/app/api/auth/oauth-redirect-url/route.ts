import { NextRequest } from "next/server";

/**
 * GET /api/auth/oauth-redirect-url
 * Returns the redirect URLs used for OAuth. Use these to fix 400 on authorize.
 *
 * - appRedirectUrl: add this EXACTLY in Supabase → Authentication → URL Configuration → Redirect URLs
 * - supabaseCallbackUrl: add this in Google Cloud Console and LinkedIn Developer as "Authorized redirect URI"
 */
export async function GET(request: NextRequest) {
  // Dev-only — don't expose internal URLs in production
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not available" }, { status: 404 });
  }
  const baseUrl = new URL(request.url).origin;
  const appRedirectUrl = `${baseUrl.replace(/\/$/, "")}/api/auth/callback`;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseCallbackUrl = supabaseUrl
    ? `${supabaseUrl.replace(/\/$/, "")}/auth/v1/callback`
    : "";

  return Response.json({
    appRedirectUrl,
    supabaseCallbackUrl,
    hint: "Add appRedirectUrl to Supabase Redirect URLs. Add supabaseCallbackUrl to Google/LinkedIn authorized redirect URIs.",
  });
}
