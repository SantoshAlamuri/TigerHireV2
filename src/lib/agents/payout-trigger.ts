import type { SupabaseClient } from "@supabase/supabase-js";
import { createMilestonePayouts } from "@/lib/agents/payout-milestone";

export { resolveDirectReferrerAmount } from "@/lib/agents/payout-milestone";

/**
 * Milestones an application *status change* can prove.
 *
 * Deliberately excludes 'day_90'. No status change means "this person has been
 * employed for ninety days" — that is a date, not a transition, and pretending
 * otherwise is what made the day-90 option pay nobody for five months. The
 * day-90 sweep lives in `@/lib/referrals/day90-sweep`.
 */
type PayoutTriggerEvent = "shortlisted" | "offer_accepted";

function mapNewStatusToTriggerEvent(newStatus: string): PayoutTriggerEvent | null {
  const norm = newStatus.trim().toLowerCase();
  if (norm === "shortlisted") return "shortlisted";
  if (norm === "hired" || norm === "offer_accepted") return "offer_accepted";
  return null;
}

/**
 * Creates `payout_ledger` rows when an application reaches a configured referral milestone.
 * Safe to call multiple times (idempotent per candidate + referrer + trigger_event).
 * Never throws; logs warnings on failure.
 */
export async function triggerPayoutIfEligible({
  supabase,
  candidateId,
  jobId,
  newStatus,
}: {
  supabase: SupabaseClient;
  candidateId: string;
  jobId: string;
  newStatus: string;
}): Promise<void> {
  const triggerEvent = mapNewStatusToTriggerEvent(newStatus);
  if (!triggerEvent) return;

  await createMilestonePayouts({
    supabase,
    candidateId,
    jobId,
    triggerEvent,
    attributionStatus: newStatus,
  });
}
