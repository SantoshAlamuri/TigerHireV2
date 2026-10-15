import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseJsonBody, jsonError, jsonSuccess, handleApiError } from "@/lib/api-helpers";
import { logger } from "@/lib/observability/logger";
import { env } from "@/lib/config/env";
import { validateOrigin } from "@/lib/security/csrf";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rate-limit";
import { OAUTH_SSO_PROVIDERS, isOAuthSsoProvider } from "@/lib/auth/oauth-sso-providers";
import { z } from "zod";

const initiateSsoBodySchema = z
  .object({
    provider: z.string().trim().min(1),
    redirect_to: z.string().trim().min(1).optional(),
    flow: z.enum(["public"]).optional(),
  })
  .strict();

function safeAppPath(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  const pathOnly = trimmed.split("?")[0]?.split("#")[0] ?? "/";
  if (pathOnly.includes("..")) return null;
  return trimmed;
}

/**
 * POST /api/auth/sso
 * Initiate OAuth sign-in with Google, LinkedIn, or Microsoft (Entra ID / Azure AD via Supabase `azure`).
 * The sign-in UI exposes Google and LinkedIn only; `azure` remains supported for API/enterprise callers.
 * Body: { provider: OAuthSsoProvider, redirect_to?: string }
 * Returns: { url: string } — the OAuth authorization URL to redirect the user to.
 *
 * If you see a 404 on "authorize?provider=google&...": when using the Supabase proxy
 * (NEXT_PUBLIC_SUPABASE_URL = your app URL, e.g. https://tigerhire.io), you must set
 * SUPABASE_INTERNAL_URL to your real Supabase project URL so next.config rewrites
 * forward /auth/* to Supabase. Otherwise the browser hits your app at /auth/v1/authorize
 * and Next.js has no route for it.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const rl = await checkRateLimit({ key: `auth:${ip}`, ...RATE_LIMIT_PRESETS.auth });
    if (!rl.allowed) return jsonError("Too many requests. Please wait a minute.", 429);
    const parsed = await parseJsonBody<{
      provider?: string;
      redirect_to?: string;
      flow?: "public";
    }>(request, "POST /api/auth/sso");
    if (parsed.errorResponse) return parsed.errorResponse;
    const bodyParsed = initiateSsoBodySchema.safeParse(parsed.body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 422);
    const body = bodyParsed.data;

    const provider = body.provider;
    if (!provider || !isOAuthSsoProvider(provider)) {
      return jsonError(`Invalid provider. Supported: ${OAUTH_SSO_PROVIDERS.join(", ")}`, 422);
    }

    const supabase = await createSupabaseServerClient();
    // In production use NEXT_PUBLIC_APP_URL (e.g. https://tigerhire.io) so redirects are stable.
    // Set NEXT_PUBLIC_APP_URL in Vercel to your production app URL.
    const baseUrl =
      process.env.NODE_ENV === "production"
        ? env.baseUrl || new URL(request.url).origin
        : new URL(request.url).origin;
    const redirectUrl = new URL("/api/auth/callback", baseUrl);
    const nextPath = safeAppPath(body.redirect_to);
    if (nextPath) {
      redirectUrl.searchParams.set("next", nextPath);
    }
    if (body.flow === "public") {
      redirectUrl.searchParams.set("flow", "public");
    }
    const redirectTo = redirectUrl.toString();

    let queryParams: Record<string, string> | undefined;
    let scopes: string | undefined;
    if (provider === "google") {
      queryParams = { access_type: "offline", prompt: "consent" };
    } else if (provider === "azure") {
      // Supabase requires Azure to return an email claim — see docs/guides/auth/social-login/auth-azure
      queryParams = { prompt: "select_account" };
      scopes = "email";
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams,
        ...(scopes ? { scopes } : {}),
      },
    });

    if (error || !data.url) {
      const errMsg = error?.message ?? "No URL returned";
      logger.error("SSO initiation failed", {
        provider,
        error: errMsg,
        redirectTo,
      });
      // Surface actionable message: common case is provider not configured in Supabase
      const isConfigError =
        /provider.*disabled|redirect.*uri|invalid.*client|configuration/i.test(errMsg) ||
        errMsg.includes("invalid_request");
      const message = isConfigError
        ? "OAuth provider not configured or redirect URL mismatch. See docs/AUTH_OAUTH_CUSTOM_DOMAIN.md."
        : "Sign-in failed. Please try again.";
      return jsonError(message, 500);
    }

    return jsonSuccess({ url: data.url, provider });
  } catch (err) {
    return handleApiError(err, "SSO failed", { route: "POST /api/auth/sso" });
  }
}
