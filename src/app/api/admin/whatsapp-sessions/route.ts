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

/**
 * GET /api/admin/whatsapp-sessions — list WhatsApp session rows (super_admin only).
 * Session state + context; not a full message transcript.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const { searchParams } = request.nextUrl;
    const phoneLookup = (searchParams.get("phone") ?? "").replace(/\D/g, "");

    const supabase = createSupabaseAdmin();

    if (phoneLookup.length >= 8 && phoneLookup.length <= 15) {
      const { data: row, error } = await supabase
        .from("whatsapp_sessions")
        .select(
          "id, phone, session_state, context, last_message_at, created_at, last_candidate_message_at, qa_step, alerts_expires_at, alert_last_sent_at",
        )
        .eq("phone", phoneLookup)
        .maybeSingle();

      if (error) {
        return jsonError("Failed to load WhatsApp session", 500);
      }

      return jsonSuccess({
        sessions: row ? [row] : [],
        pagination: { page: 1, limit: 1, total: row ? 1 : 0, totalPages: row ? 1 : 0 },
      });
    }

    const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
    const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;
    const page = Number.isFinite(parsedPage) ? Math.max(parsedPage, 1) : 1;
    const offset = (page - 1) * limit;
    const stateFilter = searchParams.get("state")?.trim();
    const handoverOnly = searchParams.get("handover") === "1";

    let query = supabase
      .from("whatsapp_sessions")
      .select(
        "id, phone, session_state, context, last_message_at, created_at, last_candidate_message_at, qa_step, alerts_expires_at, alert_last_sent_at",
        { count: "exact" },
      )
      .order("last_message_at", { ascending: false });

    if (stateFilter) query = query.eq("session_state", stateFilter);
    if (handoverOnly) {
      query = query.contains("context", { conversation_outcome: "handover" });
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      return jsonError("Failed to load WhatsApp sessions", 500);
    }

    const total = count ?? 0;
    return jsonSuccess({
      sessions: data ?? [],
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch WhatsApp sessions", {
      route: "GET /api/admin/whatsapp-sessions",
    });
  }
}
