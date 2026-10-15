import type { SupabaseClient } from "@supabase/supabase-js";

export interface DualApprovalStatus {
  recruiterApproved: boolean;
  hmApproved: boolean;
}

/**
 * Load shortlist_approvals for a pipeline candidate and return whether
 * recruiter and hiring_manager have approved. Use for interview gating.
 */
export async function getDualApprovalStatus(
  admin: SupabaseClient,
  pipelineCandidateId: string,
): Promise<DualApprovalStatus> {
  const { data: approvals } = await admin
    .from("shortlist_approvals")
    .select("approver_role, decision")
    .eq("pipeline_candidate_id", pipelineCandidateId);

  const recruiterApproved =
    approvals?.some(
      (a: { approver_role: string; decision: string }) =>
        a.approver_role === "recruiter" && a.decision === "approved",
    ) ?? false;
  const hmApproved =
    approvals?.some(
      (a: { approver_role: string; decision: string }) =>
        a.approver_role === "hiring_manager" && a.decision === "approved",
    ) ?? false;

  return { recruiterApproved, hmApproved };
}
