import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { notifyCvIngestedFromAgencySingle } from "@/lib/acknowledgements/agency-single";

/**
 * WhatsApp acknowledgement when an agency explicitly shares a profile with the client.
 * Call only when agency_stage transitions to shared_with_company (not on upload).
 */
export async function triggerAgencyShareNotification(params: {
  jobId: string;
  candidateId: string;
  agencyOrganisationId: string | null;
}): Promise<void> {
  const { jobId, candidateId, agencyOrganisationId } = params;
  if (!agencyOrganisationId) return;

  const admin = createSupabaseAdmin();

  const [{ data: job }, { data: candidate }, { data: application }, { data: agencyOrg }] =
    await Promise.all([
      admin.from("jobs").select("id, title, organisation_id").eq("id", jobId).maybeSingle(),
      admin
        .from("candidates")
        .select("id, name, full_name, phone, email")
        .eq("id", candidateId)
        .maybeSingle(),
      admin
        .from("applications")
        .select("id, source")
        .eq("job_id", jobId)
        .eq("candidate_id", candidateId)
        .maybeSingle(),
      admin.from("organisations").select("name").eq("id", agencyOrganisationId).maybeSingle(),
    ]);

  if (!job || !candidate) return;
  if (application?.source !== "agency_upload") return;

  const { data: clientOrg } = job.organisation_id
    ? await admin.from("organisations").select("name").eq("id", job.organisation_id).maybeSingle()
    : { data: null };

  await notifyCvIngestedFromAgencySingle({
    applicationId: application?.id ?? null,
    candidateId,
    candidateName: candidate.full_name ?? candidate.name ?? null,
    candidatePhone: candidate.phone ?? null,
    candidateEmail: candidate.email ?? null,
    jobId,
    jobTitle: (job.title as string | null) ?? null,
    companyName: (clientOrg?.name as string | undefined) ?? "the hiring company",
    agencyName: (agencyOrg?.name as string | undefined) ?? null,
  });
}

export function fireAgencyShareNotification(params: {
  jobId: string;
  candidateId: string;
  agencyOrganisationId: string | null;
}): void {
  void triggerAgencyShareNotification(params).catch((err) => {
    logger.error("Agency share-with-company notification failed", {
      error: err instanceof Error ? err.message : String(err),
      jobId: params.jobId,
      candidateId: params.candidateId,
    });
  });
}
