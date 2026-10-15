import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";
import {
  checkRateLimit,
  getClientIpForRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security/rate-limit";
import { OAUTH_SSO_PROVIDERS, isOAuthSsoProvider } from "@/lib/auth/oauth-sso-providers";
import { z } from "zod";

const authLinkBodySchema = z
  .object({
    provider: z.string().trim().min(1),
  })
  .strict();

/**
 * POST /api/auth/link
 * Link an OAuth provider to the current authenticated user's account.
 * Body: { provider: google | linkedin_oidc | azure }
 * Returns: { url: string } — redirect URL for the OAuth linking flow.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIpForRateLimit(request);
  const rl = await checkRateLimit({ key: `auth:link:${ip}`, ...RATE_LIMIT_PRESETS.default });
  if (!rl.allowed) {
    return jsonError("Too many requests", 429);
  }

  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const parsed = await parseJsonBody<{ provider?: string }>(request, "POST /api/auth/link");
    if (parsed.errorResponse) return parsed.errorResponse;
    const bodyParsed = authLinkBodySchema.safeParse(parsed.body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 422);
    const body = bodyParsed.data;

    const provider = body.provider;
    if (!provider || !isOAuthSsoProvider(provider)) {
      return jsonError(`Invalid provider. Supported: ${OAUTH_SSO_PROVIDERS.join(", ")}`, 422);
    }

    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase.auth.linkIdentity({
      provider,
      options: {
        redirectTo: `${env.baseUrl}/settings?linked=${provider}`,
        ...(provider === "azure" ? { scopes: "email" } : {}),
      },
    });

    if (error || !data.url) {
      logger.error("Account linking failed", {
        provider,
        userId: ctx.userId,
        error: String(error),
      });
      return jsonError("Failed to link account", 500);
    }

    return jsonSuccess({ url: data.url, provider });
  } catch (err) {
    return handleApiError(err, "Account linking failed", {
      route: "POST /api/auth/link",
    });
  }
}

/**
 * GET /api/auth/link
 * Get linked OAuth identities for the current user.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUserIdentities();

    if (error) {
      logger.error("Failed to get identities", { error: String(error) });
      return jsonError("Failed to get linked accounts", 500);
    }

    const identities = (data?.identities ?? []).map((identity) => ({
      provider: identity.provider,
      identity_id: identity.identity_id,
      created_at: identity.created_at,
      last_sign_in_at: identity.last_sign_in_at,
    }));

    return jsonSuccess({ identities });
  } catch (err) {
    return handleApiError(err, "Failed to get linked accounts", {
      route: "GET /api/auth/link",
    });
  }
}
