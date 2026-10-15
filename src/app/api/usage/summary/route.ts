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
 * GET /api/usage/summary
 * Customer-facing usage counters for organisation admins.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency")) {
      return jsonError("Forbidden", 403);
    }
    if (!ctx.organisationId && !hasRole(ctx, "super_admin"))
      return jsonError("No organisation context", 400);

    const admin = createSupabaseAdmin();
    const organisationId = ctx.organisationId;

    // Use head+exact counts: `.length` of an unbounded select silently caps at
    // the PostgREST page size (~1000), understating usage for real tenants.
    const [{ count: jobsCount }, { count: candidatesCount }, { count: fitScoresCount }] =
      await Promise.all([
        hasRole(ctx, "super_admin")
          ? admin.from("jobs").select("id", { count: "exact", head: true })
          : admin
              .from("jobs")
              .select("id", { count: "exact", head: true })
              .eq("organisation_id", organisationId!),
        hasRole(ctx, "super_admin")
          ? admin.from("candidates").select("id", { count: "exact", head: true })
          : // Inner-join through candidate_unlocks counts distinct candidates
            // (one parent row per candidate regardless of unlock count).
            admin
              .from("candidates")
              .select("id, candidate_unlocks!inner(organisation_id)", {
                count: "exact",
                head: true,
              })
              .eq("candidate_unlocks.organisation_id", organisationId!),
        hasRole(ctx, "super_admin")
          ? admin
              .from("fit_scores")
              .select("id", { count: "exact", head: true })
              .or("is_test_run.eq.false,is_test_run.is.null")
          : admin
              .from("fit_scores")
              .select("id, jobs!inner(organisation_id)", { count: "exact", head: true })
              .eq("jobs.organisation_id", organisationId!)
              .or("is_test_run.eq.false,is_test_run.is.null"),
      ]);

    const candidatesProcessed = candidatesCount ?? 0;
    const fitScoresComputed = fitScoresCount ?? 0;

    return jsonSuccess({
      organisationId: organisationId ?? "all",
      jobsCount: jobsCount ?? 0,
      candidatesProcessed,
      fitScoresComputed,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch usage summary", {
      route: "GET /api/usage/summary",
    });
  }
}
