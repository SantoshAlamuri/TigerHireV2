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
import { assertJobAccess } from "@/lib/job-access";
import { isPlanDocumentNavActive } from "@/lib/navigation/plan-document-nav-filter";
import { listJobPlanOffers } from "@/lib/recruitment-plan/list-job-plan-offers";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
  "finance",
] as const;

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

    const offers = await listJobPlanOffers(supabase, {
      jobId,
      organisationId: ctx.organisationId,
      hiringManagerId: hasRole(ctx, "hiring_manager") ? ctx.userId : null,
    });

    return jsonSuccess({ offers });
  } catch (err) {
    return handleApiError(err, "Failed to load plan offers", {
      route: "GET /api/jobs/[id]/plan/offers",
    });
  }
}
