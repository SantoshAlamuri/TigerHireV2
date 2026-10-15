import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";

/**
 * GET /api/admin/users/audit-log
 * Returns user lifecycle audit events. Super admin only.
 *
 * Query params:
 *   user_id  - filter by specific user
 *   action   - filter by action (created, updated, deleted, role_changed, org_changed)
 *   from     - ISO date, events after this timestamp
 *   to       - ISO date, events before this timestamp
 *   limit    - max results (default 50, max 200)
 *   page     - page number (default 1)
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const { searchParams } = request.nextUrl;
    const userId = searchParams.get("user_id");
    const action = searchParams.get("action");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
    const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10), 1);
    const offset = (page - 1) * limit;

    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("user_audit_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (userId) query = query.eq("user_id", userId);
    if (action) query = query.eq("action", action);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);
    query = query.range(offset, offset + limit - 1);

    const { data: events, error, count } = await query;
    if (error) return jsonError("Failed to fetch audit log", 500);

    return jsonSuccess({
      events,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch audit log", {
      route: "GET /api/admin/users/audit-log",
    });
  }
}
