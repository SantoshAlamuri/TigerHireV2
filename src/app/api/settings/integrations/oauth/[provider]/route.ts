import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { providerEnum } from "@/lib/validations/integrations";
import { requireSettingsAdmin } from "@/lib/settings/server";
import { getRedis } from "@/lib/redis/client";
import { buildOauthAuthorizeUrl } from "@/lib/settings/oauth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const auth = await requireSettingsAdmin(request);
    if (auth.error) return auth.error;

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
        : "/company/settings/integrations";
    const state = randomUUID();
    const stateKey = `oauth:state:${state}`;
    const stateValue = JSON.stringify({
      scope: "organisation",
      provider,
      organisationId: auth.context.organisationId,
      userId: auth.context.userId,
      returnTo,
    });

    await redis.setex(stateKey, 600, stateValue);

    const url = buildOauthAuthorizeUrl(provider, state, "organisation");
    return NextResponse.redirect(url);
  } catch (err) {
    return handleApiError(err, "Failed to start OAuth connection", {
      route: "GET /api/settings/integrations/oauth/[provider]",
    });
  }
}
