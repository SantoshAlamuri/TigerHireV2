import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  handleApiError,
  hasRole,
  jsonError,
  jsonSuccess,
  requireAuth,
} from "@/lib/api-helpers";
import { isPlanDocumentNavActive } from "@/lib/navigation/plan-document-nav-filter";
import { listActionableTasksForUser } from "@/lib/tasks/list-actionable-tasks-for-user";

export async function GET(request: NextRequest) {
  try {
    if (!isPlanDocumentNavActive()) {
      return jsonError("Tasks is not enabled", 404);
    }

    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "hiring_manager", "finance")) {
      return jsonError("Forbidden", 403);
    }
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const jobId = request.nextUrl.searchParams.get("jobId")?.trim() || undefined;

    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();
    const { tasks, meta } = await listActionableTasksForUser(supabase, admin, ctx, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      role: ctx.role,
      jobId,
    });

    return jsonSuccess({ tasks, meta });
  } catch (err) {
    return handleApiError(err, "Failed to load pending tasks", {
      route: "GET /api/tasks/pending",
    });
  }
}
