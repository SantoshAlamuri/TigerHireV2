import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanJobOfferRow = {
  id: string;
  application_id: string;
  candidate_id: string;
  candidate_name: string;
  role_title: string;
  status: string;
  band_status: string | null;
  updated_at: string;
  sent_at: string | null;
};

export async function listJobPlanOffers(
  supabase: SupabaseClient,
  params: { jobId: string; organisationId: string; hiringManagerId?: string | null },
): Promise<PlanJobOfferRow[]> {
  let query = supabase
    .from("offers")
    .select(
      "id, application_id, role_title, status, band_status, updated_at, sent_at, applications!inner(candidate_id, job_id, candidates(name, full_name), jobs!inner(id, hiring_manager_id))",
    )
    .eq("organisation_id", params.organisationId)
    .eq("applications.job_id", params.jobId)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (params.hiringManagerId) {
    query = query.eq("applications.jobs.hiring_manager_id", params.hiringManagerId);
  }

  const { data, error } = await query;
  if (error || !data?.length) return [];

  return data.map((row) => {
    const app = row.applications as {
      candidate_id?: string;
      candidates?: { name?: string; full_name?: string } | null;
    };
    const c = app?.candidates;
    return {
      id: row.id as string,
      application_id: row.application_id as string,
      candidate_id: app?.candidate_id as string,
      candidate_name: c?.full_name ?? c?.name ?? "Candidate",
      role_title: (row.role_title as string) ?? "Offer",
      status: (row.status as string) ?? "draft",
      band_status: (row.band_status as string | null) ?? null,
      updated_at: (row.updated_at as string) ?? new Date().toISOString(),
      sent_at: (row.sent_at as string | null) ?? null,
    };
  });
}
