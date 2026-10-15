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
import { listJobPlanExceptions } from "@/lib/recruitment-plan/list-job-plan-exceptions";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isPlanDocumentNavActive()) {
      return jsonError("Plan document mode is not enabled", 404);
    }

    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

    const { id: jobId } = await params;
    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const admin = createSupabaseAdmin();
    const exceptions = await listJobPlanExceptions(admin, jobId);

    return jsonSuccess({ exceptions });
  } catch (err) {
    return handleApiError(err, "Failed to load plan exceptions", {
      route: "GET /api/jobs/[id]/plan/exceptions",
    });
  }
}
