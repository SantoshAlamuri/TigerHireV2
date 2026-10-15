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
import { logger } from "@/lib/observability/logger";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (
      !hasRole(
        ctx,
        "candidate_pro",
        "candidate_free",
        "hiring_manager",
        "leadership",
        "recruiter",
        "agency",
        "super_admin",
      )
    ) {
      return jsonError("Forbidden", 403);
    }

    const { id } = await params;
    const supabase = await createSupabaseServerClient();

    const { data: score, error } = await supabase
      .from("fit_scores")
      .select(
        "*, candidates(id, name, skills, location), jobs(id, title, organisation_id, hiring_manager_id)",
      )
      .eq("id", id)
      .single();

    if (error || !score) return jsonError("FitScore not found", 404);

    const job = score.jobs as Record<string, unknown> | null;

    // Recruiters can only see scores for their org's jobs
    if (hasRole(ctx, "leadership", "recruiter") && job?.organisation_id !== ctx.organisationId) {
      return jsonError("Forbidden", 403);
    }
    if (hasRole(ctx, "hiring_manager") && job?.hiring_manager_id !== ctx.userId) {
      return jsonError("Forbidden", 403);
    }
    if (hasRole(ctx, "agency")) {
      if (!ctx.organisationId || !job?.organisation_id) return jsonError("Forbidden", 403);
      const { data: links } = await supabase
        .from("agency_clients")
        .select("client_organisation_id")
        .eq("agency_organisation_id", ctx.organisationId);
      const linkedOrgIds = (links ?? []).map(
        (row: { client_organisation_id: string }) => row.client_organisation_id,
      );
      const allowedOrgIds = [ctx.organisationId, ...linkedOrgIds];
      if (!allowedOrgIds.includes(job.organisation_id as string))
        return jsonError("Forbidden", 403);
    }

    // Candidates see their own scores only, with restricted detail on free tier
    if (hasRole(ctx, "candidate_pro", "candidate_free")) {
      const candidate = score.candidates as Record<string, unknown> | null;
      if (candidate) {
        const { data: candidateProfile } = await supabase
          .from("candidates")
          .select("user_id")
          .eq("id", candidate.id as string)
          .single();

        if (candidateProfile?.user_id !== ctx.userId) {
          return jsonError("Forbidden", 403);
        }
      }

      // Free candidates see only overall score
      if (hasRole(ctx, "candidate_free")) {
        return jsonSuccess({
          score: {
            id: score.id,
            overall_score: score.overall_score,
            job_id: score.job_id,
            candidate_id: score.candidate_id,
            created_at: score.created_at,
          },
        });
      }
    }

    return jsonSuccess({ score });
  } catch (err) {
    return handleApiError(err, "Failed to fetch FitScore", {
      route: "GET /api/fit-score/[id]",
    });
  }
}
