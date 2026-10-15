import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jobQuerySchema, createJobSchema } from "@/lib/validations/jobs";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  getTenantScopedClient,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { JobService } from "@/lib/services/JobService";
import { logger } from "@/lib/observability/logger";
import { getCachedJobList, setCachedJobList, invalidateJobCache } from "@/lib/redis/job-cache";
import { validateOrigin } from "@/lib/security/csrf";
import { enqueueAfterResponse } from "@/lib/jobs/enqueue-after-response";
import { validateRequisitionForJob } from "@/lib/jobs/validate-requisition-for-job";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { seedPipelineStagesForNewJob } from "@/lib/pipeline/job-pipeline-seed";
import { withCorrelation } from "@/lib/observability/with-correlation";
import { withRouteSpan } from "@/lib/observability/route-span";
import { consumeManualCredits } from "@/lib/services/manual-billing";

export const GET = withCorrelation(async (request: NextRequest) =>
  withRouteSpan("GET /api/jobs", async () => {
    try {
      const ctx = await getAuthContext();
      if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

      const params = Object.fromEntries(request.nextUrl.searchParams);
      const parsed = jobQuerySchema.safeParse(params);
      if (!parsed.success) return handleZodError(parsed.error);

      const { status, search, page, limit, cursor, view } = parsed.data;
      if (
        view === "summary" &&
        !hasRole(ctx, "leadership", "recruiter", "hiring_manager", "super_admin")
      ) {
        return jsonError("Forbidden", 403);
      }

      let orgId: string | undefined;
      let organisationIds: string[] | undefined;

      const db = await getTenantScopedClient(ctx);

      if (hasRole(ctx, "agency")) {
        if (!ctx.organisationId) {
          return jsonError("No organisation associated with your account", 400);
        }
        organisationIds = db.context.accessibleOrganisationIds;
      } else if (hasRole(ctx, "leadership", "recruiter") && ctx.organisationId) {
        orgId = ctx.organisationId;
      }

      const isCandidateView = hasRole(ctx, "candidate_pro", "candidate_free");

      const cacheKey =
        organisationIds && organisationIds.length > 0
          ? `agency:${ctx.organisationId}:${new URLSearchParams(params).toString()}`
          : orgId
            ? `org:${orgId}:${new URLSearchParams(params).toString()}`
            : `user:${ctx.userId}:${new URLSearchParams(params).toString()}`;

      // Candidate browse pages should reflect close/delete actions immediately.
      // Skip Redis reads here to avoid stale user-scoped list responses.
      if (!isCandidateView) {
        const cached = await getCachedJobList(cacheKey);
        if (cached) return jsonSuccess(cached);
      }

      const listParams = {
        view,
        status,
        search,
        page,
        limit,
        cursor,
        organisationId: orgId,
        organisationIds,
        hiringManagerId: hasRole(ctx, "hiring_manager") ? ctx.userId : undefined,
        candidateView: isCandidateView,
      };

      const result = await JobService.list(db.raw, listParams);

      if (!isCandidateView) {
        await setCachedJobList(cacheKey, result as { jobs: unknown[]; pagination: unknown });
      }
      return jsonSuccess(result);
    } catch (err) {
      return handleApiError(err, "Failed to fetch jobs", {
        route: "GET /api/jobs",
      });
    }
  }),
);

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency", "hiring_manager")) {
      return jsonError("Forbidden", 403);
    }
    if (!ctx.organisationId) {
      return jsonError("No organisation associated with your account", 400);
    }

    const parsedBody = await parseJsonBody(request, "POST /api/jobs");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = createJobSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const requiresRequisitionFlow = !hasRole(ctx, "agency", "super_admin");
    if (requiresRequisitionFlow && !parsed.data.hiringRequestId) {
      return jsonError(
        "Job creation must go through an approved requisition. Use Hiring Requests to create a JD.",
        409,
      );
    }

    const supabase = await createSupabaseServerClient();

    let targetOrgId = ctx.organisationId;
    if (parsed.data.organisationId && hasRole(ctx, "agency")) {
      const { data: link } = await supabase
        .from("agency_clients")
        .select("client_organisation_id")
        .eq("agency_organisation_id", ctx.organisationId)
        .eq("client_organisation_id", parsed.data.organisationId)
        .single();
      if (!link) {
        return jsonError("Client not found or not linked to your agency", 403);
      }
      targetOrgId = link.client_organisation_id;
    }

    if (requiresRequisitionFlow && parsed.data.hiringRequestId) {
      const check = await validateRequisitionForJob(
        supabase,
        parsed.data.hiringRequestId,
        targetOrgId,
      );
      if (!check.ok) return jsonError(check.error, check.status);
    }

    try {
      const creditResult = await consumeManualCredits({
        organisationId: targetOrgId,
        creditType: "job",
        amount: 1,
        reason: "Job creation credit consumption",
        createdBy: ctx.userId,
        referenceType: "job",
      });
      if (creditResult.applied) {
        logger.info("Manual job credit consumed", {
          org_id: targetOrgId,
          balance_after: creditResult.balanceAfter,
        });
      }
    } catch (creditErr) {
      const message = creditErr instanceof Error ? creditErr.message : "Insufficient job credits";
      if (message.startsWith("Insufficient")) {
        return jsonError(message, 403);
      }
      throw creditErr;
    }

    const job = await JobService.create(
      supabase,
      {
        title: parsed.data.title,
        description: parsed.data.description,
        location: parsed.data.location ?? null,
        status: parsed.data.status,
        compensation_min: parsed.data.compensationMin ?? null,
        compensation_max: parsed.data.compensationMax ?? null,
        hiring_manager_id: parsed.data.hiringManagerId ?? null,
        role_function: parsed.data.roleFunction ?? null,
        seniority_level: parsed.data.seniorityLevel ?? null,
        skills_required: parsed.data.skillsRequired ?? [],
        skills_preferred: parsed.data.skillsPreferred ?? [],
        remote_allowed: parsed.data.remoteAllowed ?? false,
        jd_sections: parsed.data.jdSections ?? {},
        list_on_public_job_board: parsed.data.listOnPublicJobBoard ?? true,
        list_for_internal_referrals: parsed.data.listForInternalReferrals ?? true,
        applications_close_at: parsed.data.applicationsCloseAt ?? null,
        hiring_request_id: parsed.data.hiringRequestId ?? null,
      },
      ctx.userId,
      targetOrgId,
    );

    // Invalidate cache for both the client org and the agency (if agency created it)
    const agencyOrgId = hasRole(ctx, "agency") ? ctx.organisationId : undefined;
    await invalidateJobCache(undefined, targetOrgId, agencyOrgId ?? undefined);

    const newJobId = (job as { id: string }).id;
    if (requiresRequisitionFlow && parsed.data.hiringRequestId) {
      const { error: linkError } = await supabase
        .from("hiring_requests")
        .update({
          assigned_job_id: newJobId,
          status: "converted",
          updated_at: new Date().toISOString(),
        })
        .eq("id", parsed.data.hiringRequestId)
        .eq("status", "approved");
      if (linkError) {
        logger.error("Failed to link hiring request after job creation", {
          jobId: newJobId,
          hiringRequestId: parsed.data.hiringRequestId,
          error: linkError.message,
        });
      }
    }

    try {
      const admin = createSupabaseAdmin();
      await seedPipelineStagesForNewJob(admin, targetOrgId, newJobId);
    } catch (seedErr) {
      logger.error("Failed to seed pipeline stages for new job", {
        jobId: newJobId,
        error: seedErr instanceof Error ? seedErr.message : String(seedErr),
      });
    }

    enqueueAfterResponse("job-distribute", { jobId: newJobId });

    return jsonSuccess({ job }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create job", {
      route: "POST /api/jobs",
    });
  }
}
