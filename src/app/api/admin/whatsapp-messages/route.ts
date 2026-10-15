import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { logger } from "@/lib/observability/logger";

function isMissingMessageLogTable(message: string): boolean {
  const m = message.toLowerCase();
  return (
    (/whatsapp_message_log/.test(m) && m.includes("does not exist")) ||
    /could not find the table.*whatsapp_message_log/i.test(message) ||
    m.includes("schema cache")
  );
}

/**
 * GET /api/admin/whatsapp-messages?phone= — recent logged WhatsApp previews for one number (super_admin).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const phone = (request.nextUrl.searchParams.get("phone") ?? "").replace(/\D/g, "");
    if (phone.length < 8 || phone.length > 15) {
      return jsonError("Invalid or missing phone", 400);
    }

    const parsedLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "80", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 80;

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("whatsapp_message_log")
      .select(
        "id, phone, direction, wa_message_id, message_type, body_preview, metadata, delivery_status, delivery_error, delivery_updated_at, created_at",
      )
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error("whatsapp_message_log query failed", {
        code: error.code,
        message: error.message,
        details: error.details,
      });
      const raw = error.message ?? "Unknown error";
      if (isMissingMessageLogTable(raw)) {
        return jsonError(
          "Database table whatsapp_message_log is missing. Apply the migration file supabase/migrations/20260416190000_whatsapp_message_log.sql in the Supabase SQL editor or run: npx supabase db push (from the repo root), then refresh this page.",
          500,
        );
      }
      return jsonError(
        `Could not read message log (${error.code ?? "error"}): ${raw}`.slice(0, 400),
        500,
      );
    }

    return jsonSuccess({ messages: data ?? [] });
  } catch (err) {
    return handleApiError(err, "Failed to fetch WhatsApp messages", {
      route: "GET /api/admin/whatsapp-messages",
    });
  }
}
