import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasRole } from "@/lib/api-helpers";
import type { UserRole } from "@/types";
import { createTenantScopedClient, ForbiddenError } from "@/lib/tenancy/tenant-scoped-client";

export type JobRecord = {
  id: string;
  organisation_id: string;
  hiring_manager_id: string | null;
};

type AuthContext = {
  userId: string;
  role: UserRole;
  organisationId: string | null;
};

/**
 * Check if the current user can access the job (for recruiter/agency routes).
 * - hiring_manager: only their jobs
 * - leadership/recruiter: org's jobs
 * - agency: own org's jobs OR any client org's jobs (via agency_clients)
 * - super_admin: all jobs
 */
export async function assertJobAccess(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  ctx: AuthContext,
  jobId: string,
): Promise<{ job: JobRecord | null }> {
  const db = await createTenantScopedClient(ctx);
  try {
    const accessible = await db.assertJobAccess(jobId);
    if (!accessible) return { job: null };
  } catch (error) {
    if (error instanceof ForbiddenError) return { job: null };
    throw error;
  }

  const { data: job, error } = await db
    .jobs()
    .select("id, organisation_id, hiring_manager_id")
    .eq("id", jobId)
    .single();

  if (error || !job) return { job: null };

  const record: JobRecord = {
    id: job.id,
    organisation_id: job.organisation_id,
    hiring_manager_id: job.hiring_manager_id,
  };

  if (hasRole(ctx, "hiring_manager") && job.hiring_manager_id !== ctx.userId) return { job: null };

  if (hasRole(ctx, "super_admin")) return { job: record };

  // Agency and recruiter/leadership: tenant context already scoped accessible orgs
  if (hasRole(ctx, "agency", "leadership", "recruiter") && ctx.organisationId) {
    const allowedOrgIds = db.context.accessibleOrganisationIds;
    if (job.organisation_id && allowedOrgIds.includes(job.organisation_id)) return { job: record };
  }

  if (job.organisation_id !== ctx.organisationId) return { job: null };

  return { job: record };
}

/**
 * Interviewers may access a job when assigned on at least one pipeline stage (by email).
 * When pipelineCandidateId is set, the candidate's current stage must match that assignment.
 */
export async function assertInterviewerJobAccess(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  ctx: AuthContext,
  jobId: string,
  pipelineCandidateId?: string,
): Promise<{ job: JobRecord | null }> {
  if (!hasRole(ctx, "interviewer")) return { job: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const interviewerEmail = user?.email?.trim().toLowerCase();
  if (!interviewerEmail) return { job: null };

  const { data: jobRow, error: jobError } = await supabase
    .from("jobs")
    .select("id, organisation_id, hiring_manager_id")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError || !jobRow) return { job: null };

  let stageIdFilter: string | null = null;
  if (pipelineCandidateId) {
    const { data: pipelineCandidate, error: pipelineError } = await supabase
      .from("pipeline_candidates")
      .select("stage_id")
      .eq("id", pipelineCandidateId)
      .eq("job_id", jobId)
      .maybeSingle();
    if (pipelineError || !pipelineCandidate?.stage_id) return { job: null };
    stageIdFilter = pipelineCandidate.stage_id as string;
  }

  let stageQuery = supabase
    .from("pipeline_stages")
    .select("id")
    .eq("job_id", jobId)
    .ilike("interviewer_email", interviewerEmail);
  if (stageIdFilter) {
    stageQuery = stageQuery.eq("id", stageIdFilter);
  }
  const { data: stages, error: stageError } = await stageQuery.limit(1);
  if (stageError || !stages?.length) return { job: null };

  return {
    job: {
      id: jobRow.id,
      organisation_id: jobRow.organisation_id,
      hiring_manager_id: jobRow.hiring_manager_id,
    },
  };
}
