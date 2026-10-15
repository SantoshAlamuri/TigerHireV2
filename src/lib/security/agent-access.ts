import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthContext } from "@/lib/api-helpers";
import { hasRole } from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import { ForbiddenError } from "@/lib/security/tenancy";
import { assertCandidateReachable } from "@/lib/security/candidate-scope";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Organisation IDs the current user may use for candidate access checks
 * (mirrors GET /api/candidates/[id] — agency clients + recruiter agency links).
 */
export async function collectOrganisationScopeIds(
  supabase: SupabaseClient,
  ctx: AuthContext,
): Promise<string[]> {
  if (!ctx.organisationId) return [];
  let organisationIds: string[] = [ctx.organisationId];
  if (hasRole(ctx, "agency")) {
    const { data: links } = await supabase
      .from("agency_clients")
      .select("client_organisation_id")
      .eq("agency_organisation_id", ctx.organisationId);
    const clientIds = (links ?? []).map(
      (r: { client_organisation_id: string }) => r.client_organisation_id,
    );
    if (clientIds.length > 0) {
      organisationIds = [...new Set([ctx.organisationId, ...clientIds])];
    }
  } else if (hasRole(ctx, "leadership", "recruiter")) {
    const { data: agencyLinks } = await supabase
      .from("agency_clients")
      .select("agency_organisation_id")
      .eq("client_organisation_id", ctx.organisationId);
    const agencyIds = (agencyLinks ?? []).map(
      (r: { agency_organisation_id: string }) => r.agency_organisation_id,
    );
    if (agencyIds.length > 0) {
      organisationIds = [...new Set([ctx.organisationId, ...agencyIds])];
    }
  }
  return organisationIds;
}

/**
 * Recruiter-side agents: candidate must be reachable like GET /api/candidates/[id].
 *
 * Delegates to the shared resolver rather than re-deriving the rule — this
 * path previously flattened the caller's agencies into a plain org list (which
 * reaches the roles those agencies fill for other clients) and gave hiring
 * managers org-level reach, both of which the resolver fixes centrally.
 */
export async function assertRecruiterCanAccessCandidateForAgent(
  supabase: SupabaseClient,
  ctx: AuthContext,
  candidateId: string,
): Promise<void> {
  await assertCandidateReachable(supabase, ctx, candidateId);
}

/** Job must be visible to ctx (same rules as job PATCH / pipeline). */
export async function assertAgentJobAccess(
  supabase: SupabaseClient,
  ctx: AuthContext,
  jobId: string,
): Promise<{ organisation_id: string }> {
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job?.organisation_id) throw new ForbiddenError("Job not found or access denied");
  return { organisation_id: job.organisation_id };
}

/**
 * Ensures the candidate is tied to this job (application, pipeline, or FitScore).
 * Prevents cross-tenant IDOR when job is authorised but the pair is arbitrary.
 */
export async function assertCandidateLinkedToJobForAgent(
  jobId: string,
  candidateId: string,
): Promise<void> {
  const admin = createSupabaseAdmin();

  const { data: pc } = await admin
    .from("pipeline_candidates")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (pc) return;

  const { data: app } = await admin
    .from("applications")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (app) return;

  const { data: fs } = await admin
    .from("fit_scores")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .or("is_test_run.eq.false,is_test_run.is.null")
    .limit(1);
  if (fs && fs.length > 0) return;

  throw new ForbiddenError("Candidate is not associated with this job");
}
