import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthContext } from "@/lib/api-helpers";
import { hasRole } from "@/lib/api-helpers";
import { listHiringManagerJobIds } from "@/lib/jobs/hiring-manager-job-ids";
import { assertCandidateAccessForOrgs, ForbiddenError, type CandidateAccessScope } from "./tenancy";

/**
 * One place that answers "may this caller reach this candidate?".
 *
 * Three routes used to answer it separately — the candidate list, the candidate
 * detail route, the resume path, and the data agent — and they drifted, in the
 * same two ways each time:
 *
 *   1. Hiring managers were given org-level reach. The list route scoped them
 *      to their assigned jobs; detail, resumes and the agent did not, so an HM
 *      could open any candidate their company could reach.
 *   2. Recruiters had their agencies flattened into a plain org list, which
 *      reaches every job those agencies own — including roles filled for the
 *      company's competitors.
 *
 * Both are fixed here once. Callers get a single function; new candidate
 * surfaces should use it rather than re-deriving the rule.
 */

/** Organisations whose records count as this caller's own. */
export interface ResolvedCandidateAccess {
  organisationIds: string[];
}

async function assertHiringManagerReach(
  supabase: SupabaseClient,
  ctx: AuthContext,
  candidateId: string,
): Promise<ResolvedCandidateAccess> {
  if (!ctx.organisationId) throw new ForbiddenError("Forbidden");

  const hmJobIds = await listHiringManagerJobIds(supabase, ctx.organisationId, ctx.userId);
  if (hmJobIds.length === 0) throw new ForbiddenError("Forbidden");

  // Existence checks only — never materialise the org's rows to filter in
  // memory. Either link counts as "in a funnel I own": the agency backfill path
  // inserts pipeline rows with no application behind them, so requiring an
  // application alone would lock an HM out of their own board.
  const [applied, inPipeline] = await Promise.all([
    supabase
      .from("applications")
      .select("id")
      .eq("candidate_id", candidateId)
      .in("job_id", hmJobIds)
      .limit(1),
    supabase
      .from("pipeline_candidates")
      .select("id")
      .eq("candidate_id", candidateId)
      .in("job_id", hmJobIds)
      .limit(1),
  ]);
  if (applied.error) throw applied.error;
  if (inPipeline.error) throw inPipeline.error;

  const reachable = (applied.data ?? []).length > 0 || (inPipeline.data ?? []).length > 0;
  if (!reachable) throw new ForbiddenError("Forbidden");

  return { organisationIds: [ctx.organisationId] };
}

/**
 * Build the org scope for a recruiter/leadership/agency caller.
 *
 * An agency owns its clients' work, so a flat list is right. The reverse is not
 * ownership: see CandidateAccessScope in ./tenancy.
 */
export async function resolveCandidateAccessScope(
  supabase: SupabaseClient,
  ctx: AuthContext,
): Promise<{ scope: CandidateAccessScope; organisationIds: string[] }> {
  const ownOrganisationId = ctx.organisationId as string;

  if (hasRole(ctx, "agency")) {
    const { data: links } = await supabase
      .from("agency_clients")
      .select("client_organisation_id")
      .eq("agency_organisation_id", ownOrganisationId);
    const clientIds = (links ?? []).map(
      (r: { client_organisation_id: string }) => r.client_organisation_id,
    );
    const organisationIds =
      clientIds.length > 0 ? [...new Set([ownOrganisationId, ...clientIds])] : [ownOrganisationId];
    return { scope: organisationIds, organisationIds };
  }

  const { data: agencyLinks } = await supabase
    .from("agency_clients")
    .select("agency_organisation_id")
    .eq("client_organisation_id", ownOrganisationId);
  const delegatedAgencyOrganisationIds = [
    ...new Set(
      (agencyLinks ?? []).map((r: { agency_organisation_id: string }) => r.agency_organisation_id),
    ),
  ];

  return {
    scope: { ownOrganisationId, delegatedAgencyOrganisationIds },
    // Unlocks and screening runs held by an agency are the agency's, not this
    // company's, so only the own org counts for those.
    organisationIds: [ownOrganisationId],
  };
}

/**
 * Throws ForbiddenError unless the caller may reach the candidate. Returns the
 * organisations whose records the caller may then read (screening runs, etc.).
 *
 * Does not handle the candidate-viewing-themselves case; callers that support
 * it should check ownership before calling.
 */
export async function assertCandidateReachable(
  supabase: SupabaseClient,
  ctx: AuthContext,
  candidateId: string,
): Promise<ResolvedCandidateAccess> {
  if (hasRole(ctx, "super_admin")) return { organisationIds: [] };

  if (hasRole(ctx, "hiring_manager")) {
    return assertHiringManagerReach(supabase, ctx, candidateId);
  }

  if (hasRole(ctx, "leadership", "recruiter", "agency")) {
    if (!ctx.organisationId) throw new ForbiddenError("Forbidden");
    const { scope, organisationIds } = await resolveCandidateAccessScope(supabase, ctx);
    await assertCandidateAccessForOrgs(candidateId, scope);
    return { organisationIds };
  }

  throw new ForbiddenError("Forbidden");
}
