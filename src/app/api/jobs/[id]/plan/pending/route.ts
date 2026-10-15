import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import { isPlanDocumentNavActive } from "@/lib/navigation/plan-document-nav-filter";
import { listActionableTasksForUser } from "@/lib/tasks/list-actionable-tasks-for-user";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

/**
 * GET /api/jobs/[id]/plan/pending
 * Job-scoped actionable tasks for the current user on the Plan document.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isPlanDocumentNavActive()) {
      return jsonError("Plan document mode is not enabled", 404);
    }

    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const { id: jobId } = await params;
    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const admin = createSupabaseAdmin();
    const result = await listActionableTasksForUser(supabase, admin, ctx, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      role: ctx.role,
      jobId,
    });

    return jsonSuccess(result);
  } catch (err) {
    return handleApiError(err, "Failed to load plan pending tasks", {
      route: "GET /api/jobs/[id]/plan/pending",
    });
  }
}
