import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { candidateQuerySchema } from "@/lib/validations/candidates";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { CandidateService } from "@/lib/services/CandidateService";
import { selectActiveAgencyClientOrganisationIds } from "@/lib/agency/active-client-ids";
import { assertJobAccess } from "@/lib/job-access";
import { listHiringManagerJobIds } from "@/lib/jobs/hiring-manager-job-ids";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency", "hiring_manager")) {
      return jsonError("Forbidden", 403);
    }

    const rl = await checkRateLimit({
      key: `candidates-list:${ctx.userId}`,
      limit: 60,
      windowSecs: 60,
    });
    if (!rl.allowed) return jsonError("Too many requests. Please slow down.", 429);

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = candidateQuerySchema.safeParse(params);
    if (!parsed.success) return handleZodError(parsed.error);

    const supabase = await createSupabaseServerClient();

    if (parsed.data.jobId) {
      const { job } = await assertJobAccess(supabase, ctx, parsed.data.jobId);
      if (!job) return jsonError("Job not found or access denied", 404);
    }

    let allowedCandidateIds: string[] | null | undefined = undefined;

    if (hasRole(ctx, "hiring_manager")) {
      if (!ctx.organisationId) {
        return jsonSuccess({
          candidates: [],
          pagination: {
            page: parsed.data.page,
            limit: parsed.data.limit,
            total: 0,
            totalPages: 0,
            nextCursor: undefined,
          },
        });
      }
      const hmJobIds = await listHiringManagerJobIds(supabase, ctx.organisationId, ctx.userId);
      if (hmJobIds.length === 0) {
        return jsonSuccess({
          candidates: [],
          pagination: {
            page: parsed.data.page,
            limit: parsed.data.limit,
            total: 0,
            totalPages: 0,
            nextCursor: undefined,
          },
        });
      }
      const { data: appRows, error: appErr } = await supabase
        .from("applications")
        .select("candidate_id")
        .in("job_id", hmJobIds);
      if (appErr) {
        return handleApiError(appErr, "Failed to resolve hiring manager candidate scope", {
          route: "GET /api/candidates",
        });
      }
      const ids = [
        ...new Set((appRows ?? []).map((r) => (r as { candidate_id: string }).candidate_id)),
      ].filter(Boolean);
      allowedCandidateIds = ids;
    }

    // Strict multi-tenant: non-super-admins only see candidates accessible to their orgs.
    let accessibleOrganisationIds: string[] | null = null;
    if (!hasRole(ctx, "super_admin") && !hasRole(ctx, "hiring_manager")) {
      if (!ctx.organisationId) {
        return jsonSuccess({
          candidates: [],
          pagination: {
            page: parsed.data.page,
            limit: parsed.data.limit,
            total: 0,
            totalPages: 0,
            nextCursor: undefined,
          },
        });
      }
      accessibleOrganisationIds = [ctx.organisationId];
      if (hasRole(ctx, "agency")) {
        const clientIds = await selectActiveAgencyClientOrganisationIds(
          supabase,
          ctx.organisationId,
        );
        if (clientIds.length > 0) {
          accessibleOrganisationIds = [...new Set([ctx.organisationId, ...clientIds])];
        }
      }
    }

    const listParams = {
      ...parsed.data,
      accessibleOrganisationIds: accessibleOrganisationIds ?? undefined,
      allowedCandidateIds,
    };
    const result = await CandidateService.listMasked(supabase, listParams);
    return jsonSuccess(result);
  } catch (err) {
    return handleApiError(err, "Failed to fetch candidates", {
      route: "GET /api/candidates",
    });
  }
}
