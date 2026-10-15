import { createSupabaseAdmin } from "@/lib/supabase/admin";

export class ForbiddenError extends Error {
  status = 403;
  constructor(msg: string) {
    super(msg);
    this.name = "ForbiddenError";
  }
}

export async function assertJobOwnership(jobId: string, companyId: string): Promise<void> {
  const supabase = createSupabaseAdmin();
  const { data: job } = await supabase
    .from("jobs")
    .select("organisation_id")
    .eq("id", jobId)
    .single();

  if (!job || job.organisation_id !== companyId) {
    throw new ForbiddenError("Job does not belong to your company");
  }
}

export async function assertCandidateAccess(candidateId: string, companyId: string): Promise<void> {
  return assertCandidateAccessForOrgs(candidateId, [companyId]);
}

/**
 * How a caller reaches a candidate.
 *
 * A plain array means "any of these organisations", which is right when the
 * caller owns all of them (an agency and its clients).
 *
 * The delegated form is for the opposite direction: a client reaching work its
 * agencies do *for it*. Passing the agency org ids as a flat array would grant
 * the client everything the agency owns, including roles it fills for the
 * client's competitors — so delegation is scoped to jobs the agency has marked
 * as belonging to this client via jobs.client_organisation_id.
 */
export type CandidateAccessScope =
  | string[]
  | { ownOrganisationId: string; delegatedAgencyOrganisationIds: string[] };

/** Org ids whose *own* records (unlocks, screening runs) count as access. */
function directOrganisationIds(scope: CandidateAccessScope): string[] {
  return Array.isArray(scope) ? scope : [scope.ownOrganisationId];
}

/**
 * Asserts the candidate is accessible by at least one of the given organisations
 * (unlock, fit_score, or pipeline_candidates for a job of that org). Use for agency (org + client orgs).
 */
export async function assertCandidateAccessForOrgs(
  candidateId: string,
  scope: CandidateAccessScope,
): Promise<void> {
  const organisationIds = directOrganisationIds(scope);
  if (organisationIds.length === 0) {
    throw new ForbiddenError("Candidate not accessible to your company");
  }

  const supabase = createSupabaseAdmin();

  const { data: unlock } = await supabase
    .from("candidate_unlocks")
    .select("id")
    .eq("candidate_id", candidateId)
    .in("organisation_id", organisationIds)
    .limit(1)
    .maybeSingle();

  if (unlock) return;

  // client_organisation_id is named in the select as well as the filter below,
  // deliberately: the schema-drift gate parses .select() literals only, so
  // selecting it is what makes CI block a deploy that ships this code before
  // 20260805120000_jobs_client_organisation_id.sql is applied. Without that,
  // PostgREST would reject the whole query and every recruiter would fail
  // closed on candidate detail, resumes, and the data agent at once.
  let jobsQuery = supabase.from("jobs").select("id, client_organisation_id");
  if (Array.isArray(scope)) {
    jobsQuery = jobsQuery.in("organisation_id", scope);
  } else if (scope.delegatedAgencyOrganisationIds.length === 0) {
    jobsQuery = jobsQuery.eq("organisation_id", scope.ownOrganisationId);
  } else {
    // Own jobs, plus agency jobs the agency marked as this client's work.
    jobsQuery = jobsQuery.or(
      `organisation_id.eq.${scope.ownOrganisationId},` +
        `and(organisation_id.in.(${scope.delegatedAgencyOrganisationIds.join(",")}),` +
        `client_organisation_id.eq.${scope.ownOrganisationId})`,
    );
  }

  const jobIdsRes = await jobsQuery;
  // Surface the failure instead of letting it read as "no jobs, therefore
  // denied" — a schema or filter error silently degrading into a 403 is how
  // this class of bug stays invisible.
  if (jobIdsRes.error) throw jobIdsRes.error;
  const jobIds = (jobIdsRes.data ?? []).map((r: { id: string }) => r.id);
  if (jobIds.length === 0) {
    throw new ForbiddenError("Candidate not accessible to your company");
  }

  // Allow access if candidate is in pipeline for any of the org's jobs (e.g. agency "Interest Received")
  const { data: inPipeline } = await supabase
    .from("pipeline_candidates")
    .select("id")
    .eq("candidate_id", candidateId)
    .in("job_id", jobIds)
    .limit(1)
    .maybeSingle();

  if (inPipeline) return;

  // Allow access if the org has run screening for this candidate.
  const { data: screeningJob } = await supabase
    .from("screening_jobs")
    .select("id")
    .eq("candidate_id", candidateId)
    .in("organisation_id", organisationIds)
    .limit(1)
    .maybeSingle();

  if (screeningJob) return;

  const { data: fitscore } = await supabase
    .from("fit_scores")
    .select("id")
    .eq("candidate_id", candidateId)
    .in("job_id", jobIds)
    .or("is_test_run.eq.false,is_test_run.is.null")
    .limit(1);

  if (!fitscore || fitscore.length === 0) {
    throw new ForbiddenError("Candidate not accessible to your company");
  }
}

export async function assertFitScoreAccess(fitscoreId: string, companyId: string): Promise<void> {
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from("fit_scores")
    .select("id, jobs!inner(organisation_id)")
    .eq("id", fitscoreId)
    .eq("jobs.organisation_id", companyId)
    .single();

  if (!data) {
    throw new ForbiddenError("FitScore not accessible to your company");
  }
}
