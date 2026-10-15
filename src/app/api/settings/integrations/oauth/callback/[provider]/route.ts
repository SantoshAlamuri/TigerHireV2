import { NextRequest, NextResponse } from "next/server";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { providerEnum } from "@/lib/validations/integrations";
import { getRedis } from "@/lib/redis/client";
import { exchangeOauthCode } from "@/lib/settings/oauth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/repositories/integrations.repository";
import { upsertConnection } from "@/lib/repositories/integration-connections.repository";
import { encryptIntegrationToken } from "@/lib/services/secrets";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rate-limit";
import { env } from "@/lib/config/env";

interface OauthStatePayload {
  scope?: "organisation";
  provider: string;
  organisationId: string;
  userId: string;
  returnTo?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit({
      key: `settings:oauth-callback:${ip}`,
      ...RATE_LIMIT_PRESETS.auth,
    });
    if (!rl.allowed) return jsonError("Too many OAuth attempts. Please retry shortly.", 429);

    const { provider: rawProvider } = await params;
    const parsedProvider = providerEnum.safeParse(rawProvider);
    if (!parsedProvider.success) return jsonError("Invalid provider", 400);
    const provider = parsedProvider.data;
    if (provider !== "google_calendar" && provider !== "outlook" && provider !== "teams") {
      return jsonError("This provider does not use OAuth", 400);
    }

    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    if (!code || !state) return jsonError("Missing OAuth code/state", 400);

    const redis = getRedis();
    if (!redis) return jsonError("OAuth state service unavailable", 503);
    const stateKey = `oauth:state:${state}`;
    const rawState = await redis.get<string>(stateKey);
    await redis.del(stateKey);
    if (!rawState) return jsonError("Invalid or expired OAuth state", 400);

    const parsedState = JSON.parse(rawState) as OauthStatePayload;
    if (parsedState.provider !== provider || parsedState.scope !== "organisation") {
      return jsonError("OAuth state/provider mismatch", 400);
    }

    const token = await exchangeOauthCode(provider, code, "organisation");
    const supabase = await createSupabaseServerClient();

    await upsertConnection(supabase, {
      scope: "organisation",
      organisation_id: parsedState.organisationId,
      owner_user_id: null,
      provider,
      auth_type: "oauth",
      status: "connected",
      status_message: null,
      oauth_access_token: encryptIntegrationToken(token.accessToken),
      oauth_refresh_token: token.refreshToken ? encryptIntegrationToken(token.refreshToken) : null,
      oauth_token_expires_at: token.expiresAt,
      oauth_scopes: token.scopes,
      oauth_account_email: token.accountEmail,
      secret_ref: null,
      config: {},
      is_default: false,
    });

    const admin = createSupabaseAdmin();
    await writeAuditLog(admin, {
      organisation_id: parsedState.organisationId,
      actor_user_id: parsedState.userId,
      event_type: "integration.connected",
      resource_type: "integration",
      resource_id: provider,
      metadata: {
        provider,
        accountEmail: token.accountEmail,
      },
      ip_address: ip,
    });

    const safePath =
      parsedState.returnTo &&
      parsedState.returnTo.startsWith("/") &&
      !parsedState.returnTo.startsWith("//")
        ? parsedState.returnTo
        : "/company/settings/integrations";
    const delimiter = safePath.includes("?") ? "&" : "?";
    const redirectUrl = new URL(
      `${safePath}${delimiter}connected=${encodeURIComponent(provider)}`,
      env.baseUrl,
    );
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    return handleApiError(err, "Failed OAuth callback processing", {
      route: "GET /api/settings/integrations/oauth/callback/[provider]",
    });
  }
}
