import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getConnection,
  type IntegrationConnection,
  upsertConnection,
} from "@/lib/repositories/integration-connections.repository";
import { decryptIntegrationToken, encryptIntegrationToken } from "@/lib/services/secrets";
import { refreshOauthToken } from "@/lib/settings/oauth";
import type { Provider } from "@/lib/validations/integrations";

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const expiresMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresMs)) return false;
  return expiresMs - Date.now() <= 5 * 60 * 1000;
}

async function ensureValidOauthConnection(
  supabase: SupabaseClient,
  connection: IntegrationConnection,
): Promise<IntegrationConnection | null> {
  if (connection.auth_type !== "oauth" || connection.status !== "connected") return connection;
  if (!isExpiringSoon(connection.oauth_token_expires_at)) return connection;
  if (!connection.oauth_refresh_token) return connection;

  try {
    const refreshToken = decryptIntegrationToken(connection.oauth_refresh_token);
    const refreshed = await refreshOauthToken(
      connection.provider as Provider,
      refreshToken,
      connection.scope === "user" ? "user" : "organisation",
    );
    const updated = await upsertConnection(supabase, {
      scope: connection.scope,
      organisation_id: connection.organisation_id,
      owner_user_id: connection.owner_user_id,
      provider: String(connection.provider),
      auth_type: "oauth",
      status: "connected",
      status_message: null,
      oauth_access_token: encryptIntegrationToken(refreshed.accessToken),
      oauth_refresh_token: refreshed.refreshToken
        ? encryptIntegrationToken(refreshed.refreshToken)
        : connection.oauth_refresh_token,
      oauth_token_expires_at: refreshed.expiresAt,
      oauth_scopes: refreshed.scopes,
      oauth_account_email: refreshed.accountEmail ?? connection.oauth_account_email,
    });
    return updated;
  } catch (error) {
    await upsertConnection(supabase, {
      scope: connection.scope,
      organisation_id: connection.organisation_id,
      owner_user_id: connection.owner_user_id,
      provider: String(connection.provider),
      status: "error",
      status_message:
        error instanceof Error
          ? `OAuth token refresh failed: ${error.message}`
          : "OAuth token refresh failed",
    });
    return null;
  }
}

/**
 * For recruiter/interviewer calendars:
 * user-scoped token first, then org default.
 */
export async function resolveCalendarConnection(
  supabase: SupabaseClient,
  args: {
    organisationId: string;
    userId: string;
    provider: Provider;
  },
): Promise<IntegrationConnection | null> {
  const userConnection = await getConnection(supabase, {
    scope: "user",
    provider: args.provider,
    organisationId: args.organisationId,
    ownerUserId: args.userId,
  });
  if (userConnection && userConnection.status === "connected") {
    const validUserConnection = await ensureValidOauthConnection(supabase, userConnection);
    if (validUserConnection) return validUserConnection;
  }

  const orgConnection = await getConnection(supabase, {
    scope: "organisation",
    provider: args.provider,
    organisationId: args.organisationId,
  });
  if (orgConnection && orgConnection.status === "connected") {
    const validOrgConnection = await ensureValidOauthConnection(supabase, orgConnection);
    if (validOrgConnection) return validOrgConnection;
  }

  return null;
}

/**
 * For infra providers (rooms/transcription):
 * platform default first, then org override as fallback.
 */
export async function resolveInfraConnection(
  supabase: SupabaseClient,
  args: {
    organisationId: string;
    provider: Provider;
  },
): Promise<IntegrationConnection | null> {
  const platformConnection = await getConnection(supabase, {
    scope: "platform",
    provider: args.provider,
  });
  if (platformConnection && platformConnection.status === "connected") {
    const validPlatformConnection = await ensureValidOauthConnection(supabase, platformConnection);
    if (validPlatformConnection) return validPlatformConnection;
  }

  const orgConnection = await getConnection(supabase, {
    scope: "organisation",
    provider: args.provider,
    organisationId: args.organisationId,
  });
  if (orgConnection && orgConnection.status === "connected") {
    const validOrgConnection = await ensureValidOauthConnection(supabase, orgConnection);
    if (validOrgConnection) return validOrgConnection;
  }

  return null;
}
