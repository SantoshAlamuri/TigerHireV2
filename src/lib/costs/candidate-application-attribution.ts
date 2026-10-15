import type { SupabaseClient } from "@supabase/supabase-js";

/** Hiring org + job from the candidate's most recent application (for LLM ledger rows). */
export type CandidateApplicationCostAttribution = {
  organisationId?: string;
  jobId?: string;
};

/**
 * Resolve organisation_id and job_id from the candidate's latest application row.
 * Used to attribute platform_cost_events when the call is candidate-centric (verify, ghostbuster, resume parse).
 */
export async function fetchAttributionFromLatestApplication(
  supabase: SupabaseClient,
  candidateId: string,
): Promise<CandidateApplicationCostAttribution> {
  const { data: latestApplication } = await supabase
    .from("applications")
    .select("job_id")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestApplication?.job_id) return {};

  const jobId = latestApplication.job_id as string;
  const { data: jobRow } = await supabase
    .from("jobs")
    .select("organisation_id")
    .eq("id", jobId)
    .maybeSingle();

  const organisationId = (jobRow?.organisation_id as string | null | undefined) ?? undefined;
  return {
    jobId,
    ...(organisationId ? { organisationId } : {}),
  };
}
