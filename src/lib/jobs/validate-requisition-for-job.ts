import type { SupabaseClient } from "@supabase/supabase-js";

export type RequisitionForJobCheck = { ok: true } | { ok: false; status: number; error: string };

/**
 * A company-side job must be born from an approved, unlinked hiring request
 * that belongs to the target organisation. Split out of POST /api/jobs for the
 * file-size gate; the checks and their status codes are unchanged.
 */
export async function validateRequisitionForJob(
  supabase: SupabaseClient,
  hiringRequestId: string,
  targetOrgId: string,
): Promise<RequisitionForJobCheck> {
  const { data: requisition, error } = await supabase
    .from("hiring_requests")
    .select("id, organisation_id, status, assigned_job_id")
    .eq("id", hiringRequestId)
    .maybeSingle();
  if (error || !requisition) {
    return { ok: false, status: 404, error: "Hiring request not found" };
  }
  if ((requisition.organisation_id as string) !== targetOrgId) {
    return {
      ok: false,
      status: 403,
      error: "Hiring request does not belong to this organisation",
    };
  }
  if ((requisition.status as string) !== "approved") {
    return {
      ok: false,
      status: 409,
      error: "Only approved hiring requests can be converted into jobs",
    };
  }
  if (requisition.assigned_job_id) {
    return { ok: false, status: 409, error: "This hiring request is already linked to a job" };
  }
  return { ok: true };
}
