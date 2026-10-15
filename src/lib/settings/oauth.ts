import { env } from "@/lib/config/env";
import type { Provider } from "@/lib/validations/integrations";

export type OauthScope = "organisation" | "user";

export function getOauthRedirectUri(
  provider: Provider,
  scope: OauthScope = "organisation",
): string {
  const prefix =
    scope === "user"
      ? "/api/settings/me/integrations/oauth/callback"
      : "/api/settings/integrations/oauth/callback";
  // The single-URI overrides belong to the organisation flow; personal
  // connections always come back to their own callback.
  if (scope === "user") return `${env.baseUrl}${prefix}/${provider}`;
  if (provider === "google_calendar") {
    return process.env.GOOGLE_OAUTH_REDIRECT_URI || `${env.baseUrl}${prefix}/google_calendar`;
  }
  return process.env.MICROSOFT_OAUTH_REDIRECT_URI || `${env.baseUrl}${prefix}/${provider}`;
}

export function buildOauthAuthorizeUrl(
  provider: Provider,
  state: string,
  scope: OauthScope = "organisation",
): string {
  if (provider === "google_calendar") {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
      redirect_uri: getOauthRedirectUri(provider, scope),
      response_type: "code",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      scope:
        "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  const tenant = process.env.MICROSOFT_OAUTH_TENANT || "common";
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_OAUTH_CLIENT_ID || "",
    redirect_uri: getOauthRedirectUri(provider, scope),
    response_type: "code",
    response_mode: "query",
    scope: "offline_access Calendars.ReadWrite OnlineMeetings.ReadWrite User.Read",
    state,
  });
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
}

export interface OauthTokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
  accountEmail: string | null;
}

async function parseOAuthError(response: Response, provider: string, stage: string) {
  let details = "";
  try {
    const payload = (await response.json()) as { error?: string; error_description?: string };
    details = payload.error_description || payload.error || "";
  } catch {
    details = "";
  }
  const suffix = details ? `: ${details}` : "";
  throw new Error(`${provider} ${stage} failed (${response.status})${suffix}`);
}

export async function exchangeOauthCode(
  provider: Provider,
  code: string,
  scope: OauthScope = "organisation",
): Promise<OauthTokenResponse> {
  if (provider === "google_calendar") {
    const body = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
      client_secret:
        process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: getOauthRedirectUri(provider, scope),
      grant_type: "authorization_code",
    });
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenRes.ok) await parseOAuthError(tokenRes, "Google", "token exchange");
    const token = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    let accountEmail: string | null = null;
    try {
      const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (profileRes.ok) {
        const profile = (await profileRes.json()) as { email?: string };
        accountEmail = profile.email ?? null;
      }
    } catch {
      accountEmail = null;
    }

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt:
        typeof token.expires_in === "number"
          ? new Date(Date.now() + token.expires_in * 1000).toISOString()
          : null,
      scopes: token.scope ? token.scope.split(" ") : [],
      accountEmail,
    };
  }

  const tenant = process.env.MICROSOFT_OAUTH_TENANT || "common";
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_OAUTH_CLIENT_ID || "",
    client_secret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET || "",
    code,
    redirect_uri: getOauthRedirectUri(provider, scope),
    grant_type: "authorization_code",
    scope: "offline_access Calendars.ReadWrite OnlineMeetings.ReadWrite User.Read",
  });
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) await parseOAuthError(tokenRes, "Microsoft", "token exchange");
  const token = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  let accountEmail: string | null = null;
  try {
    const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (meRes.ok) {
      const me = (await meRes.json()) as { userPrincipalName?: string; mail?: string };
      accountEmail = me.mail || me.userPrincipalName || null;
    }
  } catch {
    accountEmail = null;
  }

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt:
      typeof token.expires_in === "number"
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
    scopes: token.scope ? token.scope.split(" ") : [],
    accountEmail,
  };
}

export async function refreshOauthToken(
  provider: Provider,
  refreshToken: string,
  scope: OauthScope = "organisation",
): Promise<OauthTokenResponse> {
  if (provider === "google_calendar") {
    const body = new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
      client_secret:
        process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenRes.ok) await parseOAuthError(tokenRes, "Google", "token refresh");
    const token = (await tokenRes.json()) as {
      access_token: string;
      expires_in?: number;
      scope?: string;
    };
    return {
      accessToken: token.access_token,
      refreshToken,
      expiresAt:
        typeof token.expires_in === "number"
          ? new Date(Date.now() + token.expires_in * 1000).toISOString()
          : null,
      scopes: token.scope ? token.scope.split(" ") : [],
      accountEmail: null,
    };
  }

  const tenant = process.env.MICROSOFT_OAUTH_TENANT || "common";
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_OAUTH_CLIENT_ID || "",
    client_secret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET || "",
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: "offline_access Calendars.ReadWrite OnlineMeetings.ReadWrite User.Read",
    redirect_uri: getOauthRedirectUri(provider, scope),
  });
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) await parseOAuthError(tokenRes, "Microsoft", "token refresh");
  const token = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? refreshToken,
    expiresAt:
      typeof token.expires_in === "number"
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
    scopes: token.scope ? token.scope.split(" ") : [],
    accountEmail: null,
  };
}

/** Whether this deployment has the app credentials to connect a calendar. */
export function calendarProvidersConfigured(): { google: boolean; microsoft: boolean } {
  return {
    google: Boolean(
      (process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID) &&
        (process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET),
    ),
    microsoft: Boolean(
      process.env.MICROSOFT_OAUTH_CLIENT_ID && process.env.MICROSOFT_OAUTH_CLIENT_SECRET,
    ),
  };
}
