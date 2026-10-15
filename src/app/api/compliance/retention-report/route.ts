import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/compliance/retention-report
 * Lightweight retention/erasure ops snapshot for compliance reviews.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    // erasure_requests / retention_deletions carry no organisation_id, so these
    // counts are platform-wide. Restrict to super_admin — an org-scoped
    // leadership user must not see cross-tenant compliance aggregates. Per-org
    // retention reporting needs an org dimension on those tables (follow-up).
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const admin = createSupabaseAdmin();
    const [{ count: pending }, { count: completed }, { count: deletionsLast30d }] =
      await Promise.all([
        admin
          .from("erasure_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        admin
          .from("erasure_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed"),
        admin
          .from("retention_deletions")
          .select("id", { count: "exact", head: true })
          .gte("deleted_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

    return jsonSuccess({
      pendingRequests: pending ?? 0,
      completedRequests: completed ?? 0,
      deletionsLast30d: deletionsLast30d ?? 0,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load retention report", {
      route: "GET /api/compliance/retention-report",
    });
  }
}
