import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export type ReferralLinkReason =
  | "linked"
  | "already_linked_same"
  | "conflict_other_candidate"
  | "referral_not_found"
  | "no_referral_id"
  | "status_updated_existing_link"
  | "update_failed";

function logReferralCandidateLinkedMetric(params: {
  referralId: string | null;
  candidateId: string;
  linked: boolean;
  reason: ReferralLinkReason;
}): void {
  logger.info("metric.referrals_candidate_linked", {
    referral_id: params.referralId,
    candidate_id: params.candidateId,
    linked: params.linked,
    reason: params.reason,
  });
}

export async function linkReferralCandidateIfNeeded(
  supabase: SupabaseClient,
  referralId: string | null | undefined,
  candidateId: string,
): Promise<{ linked: boolean; reason: ReferralLinkReason }> {
  const id = (referralId ?? "").trim();
  if (!id) {
    const outcome = { linked: false, reason: "no_referral_id" as const };
    logReferralCandidateLinkedMetric({
      referralId: null,
      candidateId,
      linked: outcome.linked,
      reason: outcome.reason,
    });
    return outcome;
  }

  const { data: referral } = await supabase
    .from("referrals")
    .select("id, candidate_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!referral) {
    logger.warn("Scout: referral id missing while linking candidate", {
      referral_id: id,
      candidate_id: candidateId,
    });
    const outcome = { linked: false, reason: "referral_not_found" as const };
    logReferralCandidateLinkedMetric({
      referralId: id,
      candidateId,
      linked: outcome.linked,
      reason: outcome.reason,
    });
    return outcome;
  }

  const existingCandidateId = (referral.candidate_id as string | null) ?? null;
  const currentStatus = String(referral.status ?? "");

  if (existingCandidateId && existingCandidateId !== candidateId) {
    logger.warn("Scout: referral already linked to another candidate", {
      referral_id: id,
      candidate_id: candidateId,
      existing_candidate_id: existingCandidateId,
    });
    const outcome = { linked: false, reason: "conflict_other_candidate" as const };
    logReferralCandidateLinkedMetric({
      referralId: id,
      candidateId,
      linked: outcome.linked,
      reason: outcome.reason,
    });
    return outcome;
  }

  if (existingCandidateId === candidateId) {
    if (currentStatus === "pending") {
      await supabase.from("referrals").update({ status: "cv_received" }).eq("id", id);
      const outcome = { linked: true, reason: "status_updated_existing_link" as const };
      logReferralCandidateLinkedMetric({
        referralId: id,
        candidateId,
        linked: outcome.linked,
        reason: outcome.reason,
      });
      return outcome;
    }
    const outcome = { linked: false, reason: "already_linked_same" as const };
    logReferralCandidateLinkedMetric({
      referralId: id,
      candidateId,
      linked: outcome.linked,
      reason: outcome.reason,
    });
    return outcome;
  }

  const nextStatus = currentStatus === "pending" ? "cv_received" : currentStatus;
  const { error: linkError } = await supabase
    .from("referrals")
    .update({
      candidate_id: candidateId,
      status: nextStatus || "cv_received",
    })
    .eq("id", id)
    .is("candidate_id", null);

  if (linkError) {
    logger.warn("Scout: referral candidate link update failed", {
      referral_id: id,
      candidate_id: candidateId,
      error: String(linkError),
    });
    const outcome = { linked: false, reason: "update_failed" as const };
    logReferralCandidateLinkedMetric({
      referralId: id,
      candidateId,
      linked: outcome.linked,
      reason: outcome.reason,
    });
    return outcome;
  }

  const outcome = { linked: true, reason: "linked" as const };
  logReferralCandidateLinkedMetric({
    referralId: id,
    candidateId,
    linked: outcome.linked,
    reason: outcome.reason,
  });
  return outcome;
}
