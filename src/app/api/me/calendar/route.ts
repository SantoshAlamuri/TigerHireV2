import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { loadCalendarRows } from "@/lib/calendar/access";
import { calendarProvidersConfigured } from "@/lib/settings/oauth";

/**
 * GET /api/me/calendar — the signed-in person's calendar connection and which
 * providers this deployment can connect to.
 */
export async function GET(_request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    const admin = createSupabaseAdmin();
    const rows = await loadCalendarRows(admin, [ctx.userId]);
    const row = rows.get(ctx.userId);
    return jsonSuccess({
      connection: row
        ? {
            provider: row.provider,
            status: row.status,
            email: row.oauth_account_email,
            message: row.status_message,
          }
        : null,
      available: calendarProvidersConfigured(),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load your calendar", { route: "GET /api/me/calendar" });
  }
}
