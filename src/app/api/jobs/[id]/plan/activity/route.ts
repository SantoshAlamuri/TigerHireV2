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
import { listJobStageCandidateActivity } from "@/lib/recruitment-plan/stage-candidate-activity";

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
    const { data: plan } = await admin
      .from("recruitment_plans")
      .select("id")
      .eq("job_id", jobId)
      .maybeSingle();

    const activity = await listJobStageCandidateActivity(admin, {
      jobId,
      planId: plan?.id as string | undefined,
      limit: 50,
    });

    return jsonSuccess({ activity });
  } catch (err) {
    return handleApiError(err, "Failed to load plan activity", {
      route: "GET /api/jobs/[id]/plan/activity",
    });
  }
}
