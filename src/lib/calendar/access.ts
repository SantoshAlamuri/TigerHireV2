/**
 * A person's connected calendar, ready to call: the right provider and a
 * live access token (refreshed when close to expiry).
 *
 * Failures are explicit. A refresh that fails marks the connection as needing
 * a reconnect, so the UI can say "Reconnect your calendar" instead of quietly
 * offering times that were never checked.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { decryptIntegrationToken, encryptIntegrationToken } from "@/lib/services/secrets";
import { refreshOauthToken } from "@/lib/settings/oauth";

export type CalendarProvider = "google_calendar" | "outlook";
export const CALENDAR_PROVIDERS: CalendarProvider[] = ["google_calendar", "outlook"];

export interface CalendarAccess {
  userId: string;
  provider: CalendarProvider;
  accessToken: string;
  email: string | null;
}

export type CalendarAccessResult =
  | { ok: true; access: CalendarAccess }
  | { ok: false; reason: "not_connected" | "reconnect"; message: string };

interface Row {
  id: string;
  owner_user_id: string;
  provider: string;
  status: string;
  status_message: string | null;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  oauth_token_expires_at: string | null;
  oauth_account_email: string | null;
  updated_at: string;
}

const COLUMNS =
  "id, owner_user_id, provider, status, status_message, oauth_access_token, oauth_refresh_token, oauth_token_expires_at, oauth_account_email, updated_at";

/** Calendar connection rows for several people, newest per person. */
export async function loadCalendarRows(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, Row>> {
  const out = new Map<string, Row>();
  if (!userIds.length) return out;
  const { data, error } = await admin
    .from("integration_connections")
    .select(COLUMNS)
    .eq("scope", "user")
    .in("owner_user_id", userIds)
    .in("provider", CALENDAR_PROVIDERS)
    .order("updated_at", { ascending: false });
  if (error) {
    logger.warn("calendar_connections_load_failed", { error: error.message });
    return out;
  }
  for (const r of (data ?? []) as Row[]) {
    const prev = out.get(r.owner_user_id);
    // Prefer a working connection over a broken one, then the newest.
    if (!prev || (prev.status !== "connected" && r.status === "connected")) {
      out.set(r.owner_user_id, r);
    }
  }
  return out;
}

async function markReconnect(admin: SupabaseClient, id: string, message: string) {
  await admin
    .from("integration_connections")
    .update({ status: "error", status_message: message })
    .eq("id", id);
}

export async function accessFromRow(
  admin: SupabaseClient,
  row: Row | undefined,
): Promise<CalendarAccessResult> {
  if (!row) return { ok: false, reason: "not_connected", message: "No calendar connected" };
  if (row.status !== "connected" || !row.oauth_access_token) {
    return {
      ok: false,
      reason: "reconnect",
      message: row.status_message || "Calendar needs reconnecting",
    };
  }
  const provider = row.provider as CalendarProvider;
  const expiresAt = row.oauth_token_expires_at ? Date.parse(row.oauth_token_expires_at) : 0;
  let accessToken: string;
  try {
    accessToken = decryptIntegrationToken(row.oauth_access_token);
  } catch {
    await markReconnect(admin, row.id, "Calendar access could not be read. Reconnect it.");
    return { ok: false, reason: "reconnect", message: "Calendar needs reconnecting" };
  }

  if (!expiresAt || expiresAt - Date.now() < 2 * 60_000) {
    if (!row.oauth_refresh_token) {
      await markReconnect(admin, row.id, "Calendar access expired. Reconnect it.");
      return { ok: false, reason: "reconnect", message: "Calendar access expired" };
    }
    try {
      const fresh = await refreshOauthToken(
        provider,
        decryptIntegrationToken(row.oauth_refresh_token),
        "user",
      );
      accessToken = fresh.accessToken;
      await admin
        .from("integration_connections")
        .update({
          oauth_access_token: encryptIntegrationToken(fresh.accessToken),
          ...(fresh.refreshToken
            ? { oauth_refresh_token: encryptIntegrationToken(fresh.refreshToken) }
            : {}),
          oauth_token_expires_at: fresh.expiresAt,
          status: "connected",
          status_message: null,
        })
        .eq("id", row.id);
    } catch (err) {
      logger.warn("calendar_token_refresh_failed", {
        provider,
        userId: row.owner_user_id,
        error: String(err),
      });
      await markReconnect(admin, row.id, "Calendar access expired. Reconnect it.");
      return { ok: false, reason: "reconnect", message: "Calendar access expired" };
    }
  }

  return {
    ok: true,
    access: {
      userId: row.owner_user_id,
      provider,
      accessToken,
      email: row.oauth_account_email,
    },
  };
}

export async function getCalendarAccess(
  admin: SupabaseClient,
  userId: string,
): Promise<CalendarAccessResult> {
  const rows = await loadCalendarRows(admin, [userId]);
  return accessFromRow(admin, rows.get(userId));
}
