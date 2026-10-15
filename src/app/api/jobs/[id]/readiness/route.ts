import { NextRequest } from "next/server";
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
import { assertJobAccess } from "@/lib/job-access";
import { fetchJobReadiness } from "@/lib/jobs/job-readiness-server";
import { isPlanDocumentNavActive } from "@/lib/navigation/plan-document-nav-filter";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

/**
 * GET /api/jobs/[id]/readiness
 * Job hiring readiness for Plan document (requisition, JD, Ideal Profile, scoring).
 */
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
    const readiness = await fetchJobReadiness(admin, jobId, job.organisation_id);

    return jsonSuccess(readiness);
  } catch (err) {
    return handleApiError(err, "Failed to load job readiness", {
      route: "GET /api/jobs/[id]/readiness",
    });
  }
}
