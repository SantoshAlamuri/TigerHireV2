import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthContext, handleApiError, jsonError, requireAuth } from "@/lib/api-helpers";
import { providerEnum } from "@/lib/validations/integrations";
import { getRedis } from "@/lib/redis/client";
import { buildOauthAuthorizeUrl } from "@/lib/settings/oauth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation linked to your account", 400);

    const { provider: rawProvider } = await params;
    const parsedProvider = providerEnum.safeParse(rawProvider);
    if (!parsedProvider.success) return jsonError("Invalid provider", 400);
    const provider = parsedProvider.data;

    if (provider !== "google_calendar" && provider !== "outlook" && provider !== "teams") {
      return jsonError("This provider does not use OAuth", 400);
    }

    const redis = getRedis();
    if (!redis) return jsonError("OAuth state service unavailable", 503);
    const requestedNext = request.nextUrl.searchParams.get("next");
    const returnTo =
      requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
        ? requestedNext
        : "/company/my-settings/integrations";

    const state = randomUUID();
    const stateKey = `oauth:state:${state}`;
    await redis.setex(
      stateKey,
      600,
      JSON.stringify({
        scope: "user",
        provider,
        organisationId: ctx.organisationId,
        userId: ctx.userId,
        returnTo,
      }),
    );

    const url = buildOauthAuthorizeUrl(provider, state, "user");
    return NextResponse.redirect(url);
  } catch (err) {
    return handleApiError(err, "Failed to start personal OAuth connection", {
      route: "GET /api/settings/me/integrations/oauth/[provider]",
    });
  }
}
