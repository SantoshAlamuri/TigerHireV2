import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export type EmployeeReferralLinkReason =
  | "linked"
  | "already_linked_same"
  | "conflict_other_candidate"
  | "referral_not_found"
  | "no_referral_id"
  | "status_updated_existing_link"
  | "update_failed";

const EARLY_STATUSES = new Set(["invited", "pending", ""]);

export async function linkEmployeeReferralIfNeeded(
  supabase: SupabaseClient,
  employeeReferralId: string | null | undefined,
  candidateId: string,
): Promise<{ linked: boolean; reason: EmployeeReferralLinkReason }> {
  const id = (employeeReferralId ?? "").trim();
  if (!id) {
    return { linked: false, reason: "no_referral_id" };
  }

  const { data: referral } = await supabase
    .from("employee_referrals")
    .select("id, candidate_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!referral) {
    logger.warn("Scout: employee_referral id missing while linking candidate", {
      employee_referral_id: id,
      candidate_id: candidateId,
    });
    return { linked: false, reason: "referral_not_found" };
  }

  const existingCandidateId = (referral.candidate_id as string | null) ?? null;
  const currentStatus = String(referral.status ?? "");

  if (existingCandidateId && existingCandidateId !== candidateId) {
    logger.warn("Scout: employee_referral already linked to another candidate", {
      employee_referral_id: id,
      candidate_id: candidateId,
      existing_candidate_id: existingCandidateId,
    });
    return { linked: false, reason: "conflict_other_candidate" };
  }

  if (existingCandidateId === candidateId) {
    if (EARLY_STATUSES.has(currentStatus)) {
      const { error } = await supabase
        .from("employee_referrals")
        .update({ status: "cv_received", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        return { linked: false, reason: "update_failed" };
      }
      return { linked: true, reason: "status_updated_existing_link" };
    }
    return { linked: false, reason: "already_linked_same" };
  }

  const nextStatus = EARLY_STATUSES.has(currentStatus)
    ? "cv_received"
    : currentStatus || "cv_received";
  const { error: linkError } = await supabase
    .from("employee_referrals")
    .update({
      candidate_id: candidateId,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("candidate_id", null);

  if (linkError) {
    logger.warn("Scout: employee_referral candidate link update failed", {
      employee_referral_id: id,
      candidate_id: candidateId,
      error: String(linkError),
    });
    return { linked: false, reason: "update_failed" };
  }

  logger.info("metric.employee_referrals_candidate_linked", {
    employee_referral_id: id,
    candidate_id: candidateId,
  });
  return { linked: true, reason: "linked" };
}
