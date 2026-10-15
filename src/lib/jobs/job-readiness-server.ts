import type { SupabaseClient } from "@supabase/supabase-js";
import { countPendingJdApprovalForJob } from "@/lib/fitscore/pending-jd-approval";
import { FEATURE_FLAG_HYBRID_V2 } from "@/lib/fitscore/hybrid/constants";
import { isEnabled } from "@/lib/feature-flags";
import { computeJobReadiness, type JobReadinessResponse } from "@/lib/jobs/job-readiness";

export type { JobReadinessResponse };

export async function fetchJobReadiness(
  admin: SupabaseClient,
  jobId: string,
  organisationId: string,
): Promise<JobReadinessResponse> {
  const hybrid_v2_enabled = await isEnabled(FEATURE_FLAG_HYBRID_V2, organisationId);

  const { data: jobRow, error: jobErr } = await admin
    .from("jobs")
    .select(
      "id, description, jd_sections, hiring_request_id, hiring_requests!jobs_hiring_request_id_fkey(id, status, req_code, on_hold_reason, reviewed_by)",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr || !jobRow) {
    throw new Error(jobErr?.message ?? "Job not found");
  }

  const hrRaw = jobRow.hiring_requests as
    | {
        id?: string;
        status?: string | null;
        req_code?: string | null;
        on_hold_reason?: string | null;
        reviewed_by?: string | null;
      }
    | {
        id?: string;
        status?: string | null;
        req_code?: string | null;
        on_hold_reason?: string | null;
        reviewed_by?: string | null;
      }[]
    | null;

  const hr = Array.isArray(hrRaw) ? hrRaw[0] : hrRaw;
  const hiring_request_id =
    (jobRow.hiring_request_id as string | null) ?? (hr?.id as string | undefined) ?? null;

  let reviewer_name: string | null = null;
  if (hr?.reviewed_by) {
    const { data: reviewer } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", hr.reviewed_by)
      .maybeSingle();
    reviewer_name = (reviewer?.full_name as string | null)?.trim() ?? null;
  }

  const { data: jdBase } = await admin
    .from("jd_base_documents")
    .select("id, approved_by, approved_at")
    .eq("job_id", jobId)
    .maybeSingle();

  let approver_name: string | null = null;
  if (jdBase?.approved_by) {
    const { data: approver } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", jdBase.approved_by as string)
      .maybeSingle();
    approver_name = (approver?.full_name as string | null)?.trim() ?? null;
  }

  const { data: scoreRows } = await admin
    .from("fit_scores")
    .select("id, ideal_match_pct")
    .eq("job_id", jobId)
    .is("superseded_at", null);

  let hybrid_v2_count = 0;
  let legacy_count = 0;
  for (const row of scoreRows ?? []) {
    if (row.ideal_match_pct != null) hybrid_v2_count += 1;
    else legacy_count += 1;
  }

  const pending_scoring_count = hybrid_v2_enabled
    ? await countPendingJdApprovalForJob(admin, jobId)
    : 0;

  return computeJobReadiness({
    hybrid_v2_enabled,
    hiring_request_id,
    req_status: (hr?.status as string | null) ?? null,
    req_code: (hr?.req_code as string | null) ?? null,
    reviewer_name,
    on_hold_reason: (hr?.on_hold_reason as string | null) ?? null,
    description: (jobRow.description as string | null) ?? null,
    jd_sections: jobRow.jd_sections,
    jd_base_id: (jdBase?.id as string | null) ?? null,
    approved_by: (jdBase?.approved_by as string | null) ?? null,
    approved_at: (jdBase?.approved_at as string | null) ?? null,
    approver_name,
    hybrid_v2_count,
    legacy_count,
    pending_scoring_count,
  });
}
