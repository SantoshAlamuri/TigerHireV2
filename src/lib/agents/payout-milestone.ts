import type { SupabaseClient } from "@supabase/supabase-js";
import { bridgeEmployeeReferralAttribution } from "@/lib/agents/employee-referral-attribution";
import { logger } from "@/lib/observability/logger";
import { insertLedgerIfAbsent } from "@/lib/agents/payout-ledger-insert";
import type { PayoutMilestoneEvent } from "@/lib/agents/payout-milestone-event";

/**
 * Writing referral payouts for a milestone, independent of what proved the
 * milestone happened.
 *
 * This was the body of `triggerPayoutIfEligible`, reachable only from an
 * application status change. Day 90 cannot come from a status change — it is a
 * date ninety days after someone actually started — so the payout logic had to
 * stop being owned by the status-change path before it could be shared.
 *
 * Every rule that guarded money is unchanged: the config must exist and its
 * `bonus_trigger` must match, the ledger insert is an idempotent upsert on
 * (candidate, referrer, trigger_event), and nothing throws.
 */
export type { PayoutMilestoneEvent } from "@/lib/agents/payout-milestone-event";

/**
 * Which rate the direct referrer is paid at.
 *
 * job_referral_config carries three rates for one slot, because three kinds of
 * person can refer: an org-verified employee, a candidate already in the
 * pipeline passing on someone they know, and everyone else. Only two were ever
 * read, so a job with a candidate-referral rate configured quietly paid the
 * generic rate and the setting did nothing.
 *
 * Employee beats candidate. Someone org-verified is staff, and a staff referral
 * is a different scheme from a candidate recommending a friend — if a person is
 * somehow both, the employment relationship is the stronger claim.
 *
 * A rate of zero or NaN is not a rate: it falls through to the generic amount
 * rather than paying nothing, because "configured as 0" and "not configured"
 * are indistinguishable in this table and paying nobody is the worse reading.
 */
export function resolveDirectReferrerAmount(args: {
  directAmount: number;
  employeeAmount: number;
  candidateReferrerAmount: number;
  isOrgVerified: boolean;
  isCandidate: boolean;
  candidateReferralsEnabled: boolean;
}): number {
  const usable = (n: number) => Number.isFinite(n) && n > 0;
  if (args.isOrgVerified && usable(args.employeeAmount)) return args.employeeAmount;
  if (args.isCandidate && args.candidateReferralsEnabled && usable(args.candidateReferrerAmount)) {
    return args.candidateReferrerAmount;
  }
  return args.directAmount;
}

/**
 * Creates `payout_ledger` rows for a candidate who has reached `triggerEvent`
 * on `jobId`. Idempotent per (candidate, referrer, trigger_event); never throws.
 *
 * `attributionStatus` is the status handed to the employee-referral attribution
 * bridge. For a status change it is that status; for the day-90 sweep there is
 * no new status, so the caller passes "hired" — the hire already happened.
 *
 * @returns how many payout_ledger rows were actually written — 0 when the
 * milestone was already recorded, so a re-run reports nothing rather than
 * re-counting payouts that already happened.
 */
export async function createMilestonePayouts({
  supabase,
  candidateId,
  jobId,
  triggerEvent,
  attributionStatus,
}: {
  supabase: SupabaseClient;
  candidateId: string;
  jobId: string;
  triggerEvent: PayoutMilestoneEvent;
  attributionStatus: string;
}): Promise<number> {
  try {
    if (!triggerEvent) return 0;

    const { data: config, error: configErr } = await supabase
      .from("job_referral_config")
      .select(
        "bonus_trigger, direct_bonus_amount, employee_bonus_amount, parent_bonus_amount, candidate_referrer_bonus_amount, candidate_referrer_enabled, bonus_currency",
      )
      .eq("job_id", jobId)
      .maybeSingle();

    if (configErr) {
      logger.warn("createMilestonePayouts: job_referral_config query failed", {
        jobId,
        candidateId,
        error: configErr.message,
      });
      return 0;
    }
    if (!config) return 0;
    if (config.bonus_trigger !== triggerEvent) return 0;

    const { data: app, error: appErr } = await supabase
      .from("applications")
      .select("direct_referrer_id, parent_referrer_id")
      .eq("candidate_id", candidateId)
      .eq("job_id", jobId)
      .maybeSingle();

    if (appErr) {
      logger.warn("createMilestonePayouts: applications query failed", {
        jobId,
        candidateId,
        error: appErr.message,
      });
      return 0;
    }
    if (!app) return 0;

    await bridgeEmployeeReferralAttribution(supabase, candidateId, jobId, attributionStatus);

    const { data: appAfterBridge } = await supabase
      .from("applications")
      .select("direct_referrer_id, parent_referrer_id")
      .eq("candidate_id", candidateId)
      .eq("job_id", jobId)
      .maybeSingle();

    const bridgedApp = appAfterBridge ?? app;
    const directId = bridgedApp.direct_referrer_id as string | null | undefined;
    const parentId = bridgedApp.parent_referrer_id as string | null | undefined;
    if (!directId && !parentId) return 0;

    const currency =
      typeof config.bonus_currency === "string" && config.bonus_currency.trim() !== ""
        ? config.bonus_currency
        : "INR";
    const directAmount = Number(config.direct_bonus_amount);
    const employeeAmount = Number(config.employee_bonus_amount);
    const parentAmount = Number(config.parent_bonus_amount);
    const candidateReferrerAmount = Number(config.candidate_referrer_bonus_amount);
    let effectiveDirectAmount = directAmount;

    let directReferrerOrgVerified = false;
    let directReferrerIsCandidate = false;
    if (directId) {
      const { data: directReferrer, error: directReferrerErr } = await supabase
        .from("referrers")
        .select("org_verified, type")
        .eq("id", directId)
        .maybeSingle();
      if (directReferrerErr) {
        logger.warn("createMilestonePayouts: direct referrer lookup failed", {
          jobId,
          candidateId,
          referrerId: directId,
          error: directReferrerErr.message,
        });
      } else {
        directReferrerOrgVerified = Boolean(directReferrer?.org_verified);
        directReferrerIsCandidate = directReferrer?.type === "candidate";
      }
    }

    effectiveDirectAmount = resolveDirectReferrerAmount({
      directAmount,
      employeeAmount,
      candidateReferrerAmount,
      isOrgVerified: directReferrerOrgVerified,
      isCandidate: directReferrerIsCandidate,
      candidateReferralsEnabled: config.candidate_referrer_enabled === true,
    });

    const wroteDirect = await insertLedgerIfAbsent(supabase, {
      candidateId,
      jobId,
      referrerId: directId ?? null,
      referrerLevel: "direct",
      triggerEvent,
      amount: effectiveDirectAmount,
      currency,
    });

    const wroteParent = await insertLedgerIfAbsent(supabase, {
      candidateId,
      jobId,
      referrerId: parentId ?? null,
      referrerLevel: "parent",
      triggerEvent,
      amount: parentAmount,
      currency,
    });

    return (wroteDirect ? 1 : 0) + (wroteParent ? 1 : 0);
  } catch (err) {
    logger.warn("createMilestonePayouts: unexpected error", {
      jobId,
      candidateId,
      triggerEvent,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
