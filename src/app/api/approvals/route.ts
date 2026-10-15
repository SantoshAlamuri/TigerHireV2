import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { listPendingApprovalItems } from "@/lib/approvals/list-pending-approval-items";

/**
 * GET /api/approvals
 * Unified inbox for actionable approvals for the current user.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, "hiring_manager", "recruiter", "leadership", "super_admin", "finance")) {
      return jsonError("Forbidden", 403);
    }

    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();
    const { shortlistApprovals, items } = await listPendingApprovalItems(supabase, admin, ctx);

    return jsonSuccess({
      pendingApprovals: shortlistApprovals,
      items,
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch approvals", {
      route: "GET /api/approvals",
    });
  }
}
