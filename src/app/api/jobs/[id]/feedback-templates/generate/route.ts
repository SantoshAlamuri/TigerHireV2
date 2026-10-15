import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertJobAccess } from "@/lib/job-access";
import { validateOrigin } from "@/lib/security/csrf";
import { generateCompetenciesFromRubric } from "@/lib/feedback/scorecard-from-rubric";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

/**
 * POST /api/jobs/[id]/feedback-templates/generate
 * Draft scorecard competencies from the job's JD Base rubric (scoring dimensions + ICP).
 * Returns { fields, suggestedName } — the editor pre-fills; nothing is saved.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

    const { id: jobId } = await params;
    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const { data: jdBase } = await supabase
      .from("jd_base_documents")
      .select("role_title, context, weights, ideal_candidate_profile")
      .eq("job_id", jobId)
      .maybeSingle();

    const { data: jobRow } = await supabase
      .from("jobs")
      .select("title, organisation_id")
      .eq("id", jobId)
      .maybeSingle();

    if (!jdBase) {
      return jsonError(
        "No role rubric found for this job yet. Set up scoring (ICP & rubric) first, then generate.",
        404,
      );
    }

    const icp = (jdBase.ideal_candidate_profile ?? null) as {
      summary?: string;
      must_haves?: string[];
    } | null;

    const fields = await generateCompetenciesFromRubric({
      roleTitle:
        (jdBase.role_title as string | null) ?? (jobRow?.title as string | null) ?? "this role",
      context: (jdBase.context as string | null) ?? null,
      weights: (jdBase.weights as Record<string, number> | null) ?? null,
      idealSummary: icp?.summary ?? null,
      mustHaves: Array.isArray(icp?.must_haves) ? icp.must_haves : null,
      attribution: {
        jobId,
        organisationId: (jobRow?.organisation_id as string | null) ?? undefined,
      },
    });

    const suggestedName = `${(jobRow?.title as string | null)?.trim() || "Interview"} Scorecard`;
    return jsonSuccess({ fields, suggestedName });
  } catch (err) {
    return handleApiError(err, "Failed to generate scorecard", {
      route: "POST /api/jobs/[id]/feedback-templates/generate",
    });
  }
}
