import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import type { PayoutMilestoneEvent } from "@/lib/agents/payout-milestone-event";

/**
 * Write one payout_ledger row for a referrer, unless the milestone is already
 * recorded for them. Returns whether a row was actually written.
 *
 * Extracted from payout-milestone.ts to keep that file under the 250-line size
 * gate; behaviour is unchanged.
 */
export async function insertLedgerIfAbsent(
  supabase: SupabaseClient,
  args: {
    candidateId: string;
    jobId: string;
    referrerId: string | null;
    referrerLevel: "direct" | "parent";
    triggerEvent: PayoutMilestoneEvent;
    amount: number;
    currency: string;
  },
): Promise<boolean> {
  const { candidateId, jobId, referrerId, referrerLevel, triggerEvent, amount, currency } = args;
  if (!referrerId) return false;

  // Race-safe idempotency: the unique index (candidate_id, referrer_id,
  // trigger_event) backs an ON CONFLICT DO NOTHING upsert, so concurrent
  // triggers cannot create duplicate payout rows.
  //
  // job_id is recorded rather than inferred later: payout_export used to recover
  // it by guessing the candidate's most recently updated application, which
  // names the wrong role for anyone who applied twice — and that title is what
  // finance allocates the cost to.
  //
  // `.select()` returns only rows actually inserted, so the caller can tell a
  // written payout from an already-recorded one; without it a sweep counts
  // attempts and reports them as payouts.
  const { data: inserted, error: upsertErr } = await supabase
    .from("payout_ledger")
    .upsert(
      {
        candidate_id: candidateId,
        job_id: jobId,
        referrer_id: referrerId,
        referrer_level: referrerLevel,
        trigger_event: triggerEvent,
        amount: Number.isFinite(amount) ? amount : 0,
        currency,
        status: "pending",
      },
      {
        onConflict: "candidate_id,referrer_id,trigger_event",
        ignoreDuplicates: true,
      },
    )
    .select("id");

  if (upsertErr) {
    logger.warn("triggerPayoutIfEligible: payout_ledger upsert failed", {
      candidateId,
      referrerId,
      triggerEvent,
      error: upsertErr.message,
    });
    return false;
  }
  return (inserted?.length ?? 0) > 0;
}
