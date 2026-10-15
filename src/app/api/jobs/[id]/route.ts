import { NextRequest } from "next/server";
import { updateJobSchema } from "@/lib/validations/jobs";
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
import { ForbiddenError } from "@/lib/tenancy/tenant-scoped-client";
import { handleTenantError } from "@/lib/tenancy/monitoring";
import { JobService } from "@/lib/services/JobService";
import { embedJob } from "@/lib/services/embeddings";
import { logger } from "@/lib/observability/logger";
import { getCachedJobDetail, setCachedJobDetail, invalidateJobCache } from "@/lib/redis/job-cache";
import { validateOrigin } from "@/lib/security/csrf";
import { enqueueAfterResponse } from "@/lib/jobs/enqueue-after-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function hydrateCachedOrgSlug(cached: Record<string, unknown>, job: Record<string, unknown>) {
  if (cached.orgSlug || !job.organisation_id) return cached;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: org } = await supabase
      .from("organisations")
      .select("slug")
      .eq("id", job.organisation_id as string)
      .single();

    const hydrated = { ...cached, orgSlug: org?.slug ?? null };
    await setCachedJobDetail(job.id as string, hydrated);
    return hydrated;
  } catch {
    return cached;
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const { id } = await params;

    const cached = await getCachedJobDetail(id);
    if (cached) {
      const job = cached.job as Record<string, unknown>;

      if (hasRole(ctx, "hiring_manager") && job.hiring_manager_id !== ctx.userId) {
        return jsonError("Forbidden", 403);
      }
      if (hasRole(ctx, "leadership", "recruiter") && ctx.organisationId !== job.organisation_id) {
        return jsonError("Forbidden", 403);
      }
      if (hasRole(ctx, "agency")) {
        const supabase = await createSupabaseServerClient();
        const { data: links } = await supabase
          .from("agency_clients")
          .select("client_organisation_id")
          .eq("agency_organisation_id", ctx.organisationId);
        const clientIds = (links ?? []).map(
          (r: { client_organisation_id: string }) => r.client_organisation_id,
        );
        if (
          !clientIds.length ||
          !job.organisation_id ||
          !clientIds.includes(job.organisation_id as string)
        ) {
          return jsonError("Forbidden", 403);
        }
      }
      if (hasRole(ctx, "candidate_pro", "candidate_free") && job.status !== "open") {
        return jsonError("Job not found", 404);
      }

      const hydrated = await hydrateCachedOrgSlug(cached, job);
      return jsonSuccess(hydrated);
    }

    const db = await getTenantScopedClient(ctx);

    // Automatic tenant access check - returns false if not found, throws ForbiddenError if not accessible
    let jobExists = false;
    try {
      jobExists = await db.assertJobAccess(id);
    } catch (error) {
      const tenantError = handleTenantError(error, {
        userId: ctx.userId,
        organisationId: ctx.organisationId,
        role: ctx.role,
        resourceType: "job",
        resourceId: id,
      });
      if (tenantError.isForbidden) {
        return jsonError("Forbidden", 403);
      }
      throw error;
    }

    // If jobExists is false, the job doesn't exist
    if (!jobExists) {
      return jsonError("Job not found", 404);
    }

    const job = await JobService.getById(db.raw, id);
    if (!job) return jsonError("Job not found", 404);

    // Additional check for hiring managers
    if (hasRole(ctx, "hiring_manager") && job.hiring_manager_id !== ctx.userId) {
      return jsonError("Forbidden", 403);
    }

    if (hasRole(ctx, "candidate_pro", "candidate_free") && job.status !== "open") {
      return jsonError("Job not found", 404);
    }

    let orgSlug: string | null = null;
    let organisationName: string | null = null;
    if (job.organisation_id) {
      try {
        const { data: org } = await db
          .organisations()
          .select("slug, name")
          .eq("id", job.organisation_id)
          .single();
        orgSlug = org?.slug ?? null;
        organisationName = org?.name ?? null;
      } catch {
        // If organisation query fails, continue without org details
        // This prevents 500 errors from organisation lookup failures
      }
    }
    const jobPayload = {
      ...job,
      organisation_name:
        organisationName ??
        (job.organisations as { name?: string } | null)?.name ??
        (Array.isArray(job.organisations) && (job.organisations as { name?: string }[])[0]?.name) ??
        null,
    };

    await setCachedJobDetail(id, { job: jobPayload, orgSlug } as Record<string, unknown>);
    return jsonSuccess({ job: jobPayload, orgSlug });
  } catch (err) {
    return handleApiError(err, "Failed to fetch job", {
      route: "GET /api/jobs/[id]",
    });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency")) {
      return jsonError("Forbidden", 403);
    }

    const { id } = await params;
    const parsedBody = await parseJsonBody(request, "PATCH /api/jobs/[id]");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = updateJobSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const db = await getTenantScopedClient(ctx);

    // Automatic tenant access check - returns false if not found, throws ForbiddenError if not accessible
    let jobExists = false;
    try {
      jobExists = await db.assertJobAccess(id);
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return jsonError("Forbidden", 403);
      }
      throw error;
    }

    if (!jobExists) {
      return jsonError("Job not found", 404);
    }

    const existing = await JobService.getById(db.raw, id);
    if (!existing) return jsonError("Job not found", 404);

    const updateData: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.location !== undefined) updateData.location = parsed.data.location;
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
    if (parsed.data.compensationMin !== undefined)
      updateData.compensation_min = parsed.data.compensationMin;
    if (parsed.data.compensationMax !== undefined)
      updateData.compensation_max = parsed.data.compensationMax;
    if (parsed.data.hiringManagerId !== undefined)
      updateData.hiring_manager_id = parsed.data.hiringManagerId ?? null;
    if (parsed.data.assignedRecruiterId !== undefined)
      updateData.assigned_recruiter_id = parsed.data.assignedRecruiterId ?? null;
    if (parsed.data.remoteAllowed !== undefined)
      updateData.remote_allowed = parsed.data.remoteAllowed;
    if (parsed.data.seniorityLevel !== undefined)
      updateData.seniority_level = parsed.data.seniorityLevel;
    if (parsed.data.roleFunction !== undefined) updateData.role_function = parsed.data.roleFunction;
    if (parsed.data.skillsRequired !== undefined)
      updateData.skills_required = parsed.data.skillsRequired;
    if (parsed.data.skillsPreferred !== undefined)
      updateData.skills_preferred = parsed.data.skillsPreferred;

    const existingListing = existing as {
      list_on_public_job_board?: boolean | null;
      list_for_internal_referrals?: boolean | null;
    };
    const exPub = existingListing.list_on_public_job_board ?? true;
    const exInt = existingListing.list_for_internal_referrals ?? true;
    if (
      parsed.data.listOnPublicJobBoard !== undefined ||
      parsed.data.listForInternalReferrals !== undefined
    ) {
      const nextPub = parsed.data.listOnPublicJobBoard ?? exPub;
      const nextInt = parsed.data.listForInternalReferrals ?? exInt;
      if (!nextPub && !nextInt) {
        return jsonError(
          "At least one listing option must stay enabled: public job board or internal referrals.",
          400,
        );
      }
    }
    if (parsed.data.listOnPublicJobBoard !== undefined) {
      updateData.list_on_public_job_board = parsed.data.listOnPublicJobBoard;
    }
    if (parsed.data.listForInternalReferrals !== undefined) {
      updateData.list_for_internal_referrals = parsed.data.listForInternalReferrals;
    }
    if (parsed.data.applicationsCloseAt !== undefined) {
      updateData.applications_close_at = parsed.data.applicationsCloseAt;
    }
    const embeddingInputsChanged =
      parsed.data.title !== undefined ||
      parsed.data.description !== undefined ||
      parsed.data.location !== undefined ||
      parsed.data.seniorityLevel !== undefined ||
      parsed.data.roleFunction !== undefined ||
      parsed.data.skillsRequired !== undefined;
    if (embeddingInputsChanged) {
      // Force recompute on next FitScore path to avoid stale JD semantic vectors.
      updateData.jd_embedding = null;
    }

    const prevClose = (existing as { applications_close_at?: string | null }).applications_close_at;
    const nextClose =
      parsed.data.applicationsCloseAt === undefined ? undefined : parsed.data.applicationsCloseAt;

    const updated = await JobService.update(db.raw, id, updateData);

    if (nextClose !== undefined) {
      const prevIso = prevClose == null ? null : String(prevClose);
      const nextIso = nextClose === null ? null : String(nextClose);
      if (prevIso !== nextIso) {
        await db.raw
          .from("applications")
          .update({
            app_close_reminder_7d_sent_at: null,
            app_close_reminder_24h_sent_at: null,
          })
          .eq("job_id", id);
      }
    }

    // Invalidate cache for both the client org and the agency (if agency updated it)
    const agencyOrgId = hasRole(ctx, "agency") ? ctx.organisationId : undefined;
    await invalidateJobCache(id, existing.organisation_id ?? undefined, agencyOrgId ?? undefined);

    if (parsed.data.status === "closed" && existing.status !== "closed") {
      enqueueAfterResponse("job-remove-from-boards", { jobId: id });
    }
    if (embeddingInputsChanged) {
      // Kick off async recomputation path; failures are non-blocking for recruiter edits.
      enqueueAfterResponse("fit-score-batch", { jobId: id, maxPairs: 100 });
      void embedJob(id).catch((error) => {
        logger.warn("Job embedding refresh failed after JD update", {
          jobId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    return jsonSuccess({ job: updated });
  } catch (err) {
    return handleApiError(err, "Failed to update job", {
      route: "PATCH /api/jobs/[id]",
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, "super_admin", "leadership", "agency")) {
      return jsonError("Forbidden", 403);
    }

    const { id } = await params;
    const db = await getTenantScopedClient(ctx);

    // Automatic tenant access check - returns false if not found, throws ForbiddenError if not accessible
    let jobExists = false;
    try {
      jobExists = await db.assertJobAccess(id);
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return jsonError("Forbidden", 403);
      }
      throw error;
    }

    if (!jobExists) {
      return jsonError("Job not found", 404);
    }

    const existing = await JobService.getById(db.raw, id);
    if (!existing) return jsonError("Job not found", 404);

    if (existing.status !== "closed") {
      await JobService.update(db.raw, id, { status: "closed" });
      enqueueAfterResponse("job-remove-from-boards", { jobId: id });
    }

    // Preserve candidate history by converting legacy deletes into a close action.
    const agencyOrgId = hasRole(ctx, "agency") ? ctx.organisationId : undefined;
    await invalidateJobCache(id, existing.organisation_id ?? undefined, agencyOrgId ?? undefined);

    return jsonSuccess({
      message:
        existing.status === "closed"
          ? "Job already closed. Candidate history was preserved."
          : "Job closed. Candidate history was preserved.",
      preservedCandidateHistory: true,
      jobId: id,
    });
  } catch (err) {
    return handleApiError(err, "Failed to close job safely", {
      route: "DELETE /api/jobs/[id]",
    });
  }
}
