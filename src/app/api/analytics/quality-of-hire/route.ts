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
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getQualityOfHire } from "@/lib/analytics/quality-of-hire";
import { listHiringManagerJobIds } from "@/lib/jobs/hiring-manager-job-ids";

const ROLES = ["super_admin", "leadership", "recruiter", "agency", "hiring_manager"] as const;

/**
 * GET /api/analytics/quality-of-hire
 * Quality-of-Hire report: per-job performance/retention, post-hire pulse rollup, and
 * FitScore predictive validity. Reads via the admin client (the pulse table is
 * service-role-only) but is strictly scoped to the caller's organisation (and, for hiring
 * managers, to their own jobs). Optional ?jobId= narrows the per-job sections.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...ROLES)) return jsonError("Forbidden", 403);

    const rl = await checkRateLimit({
      key: `analytics-quality-of-hire:${ctx.userId}`,
      limit: 60,
      windowSecs: 60,
    });
    if (!rl.allowed) return jsonError("Too many requests", 429);

    const orgId = ctx.organisationId;
    if (!orgId) {
      return jsonError("Select an organisation context for this report", 400);
    }

    const jobIdParam = new URL(request.url).searchParams.get("jobId") || undefined;

    // Hiring managers are scoped to their own jobs; predictive validity is an org-level
    // aggregate (no job_id), so it is withheld from managers to avoid cross-job leakage.
    let jobIds: string[] | null = null;
    let includePredictiveValidity = true;
    if (hasRole(ctx, "hiring_manager")) {
      const server = await createSupabaseServerClient();
      const hmJobIds = await listHiringManagerJobIds(server, orgId, ctx.userId);
      if (jobIdParam && !hmJobIds.includes(jobIdParam)) {
        return jsonError("Access denied to this job", 403);
      }
      jobIds = jobIdParam ? [jobIdParam] : hmJobIds;
      includePredictiveValidity = false;
    } else if (jobIdParam) {
      jobIds = [jobIdParam];
    }

    const admin = createSupabaseAdmin();
    const result = await getQualityOfHire(admin, orgId, { jobIds, includePredictiveValidity });

    return jsonSuccess({ ...result, generatedAt: new Date().toISOString() });
  } catch (err) {
    return handleApiError(err, "Failed to fetch quality-of-hire analytics", {
      route: "GET /api/analytics/quality-of-hire",
    });
  }
}
