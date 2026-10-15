import type { SupabaseClient } from "@supabase/supabase-js";
import { createMilestonePayouts } from "@/lib/agents/payout-milestone";
import { logger } from "@/lib/observability/logger";

/**
 * The day-90 referral payout sweep.
 *
 * Day 90 was selectable for five months and paid nobody: payout-trigger maps
 * status changes to two events, so 'day_90' matched nothing. It cannot come
 * from a status change at all — no transition means "still employed ninety days
 * later". It needs a clock and a start date.
 *
 * The start date is `pipeline_candidates.joined_at`, recorded by the recruiter.
 * Not `hired_at`, which is when the hire was *marked* and routinely lands weeks
 * early; not `hiring_requests.target_joining_date`, which is a plan typed before
 * a candidate existed. A row with no joining date is not due — it is unknown,
 * and it is reported as such rather than swept in on a guess.
 */

export const DAY_90 = 90;

export type Day90SweepResult = {
  due: number;
  /** Hires handed to the payout writer. */
  processed: number;
  /** payout_ledger rows actually written this run. Re-runs report 0, not `due`. */
  paid: number;
  skippedNoJoinDate: number;
};

/** ISO date (YYYY-MM-DD) ninety days before `now`. */
export function day90Cutoff(now: Date): string {
  const cutoff = new Date(now.getTime() - DAY_90 * 24 * 60 * 60 * 1000);
  return cutoff.toISOString().slice(0, 10);
}

/**
 * Find hires that crossed day 90 and whose job pays on that milestone.
 *
 * Payout creation is idempotent on (candidate, referrer, trigger_event), so
 * this deliberately does not track "already swept" state — re-running the sweep
 * re-offers the same rows and the unique index absorbs them. One less piece of
 * state to drift.
 */
export async function findDueDay90Hires(
  admin: SupabaseClient,
  now: Date,
): Promise<{ candidateId: string; jobId: string }[]> {
  const cutoff = day90Cutoff(now);

  const { data: configs, error: cfgErr } = await admin
    .from("job_referral_config")
    .select("job_id")
    .eq("bonus_trigger", "day_90");
  if (cfgErr) throw cfgErr;

  const jobIds = (configs ?? []).map((c) => c.job_id as string).filter(Boolean);
  if (jobIds.length === 0) return [];

  const { data: hires, error: hiresErr } = await admin
    .from("pipeline_candidates")
    .select("candidate_id, job_id, joined_at")
    .in("job_id", jobIds)
    .eq("status", "hired")
    .not("joined_at", "is", null)
    .lte("joined_at", cutoff)
    .limit(5000);
  if (hiresErr) throw hiresErr;

  return (hires ?? []).map((h) => ({
    candidateId: h.candidate_id as string,
    jobId: h.job_id as string,
  }));
}

/**
 * Count hires that would already be due if anyone had recorded a start date.
 *
 * Surfaced rather than swallowed. The original bug was a payout that silently
 * never happened; a hire the recruiter never gave a start date is the same
 * silence in a new place, so the sweep reports it every run.
 *
 * Bounded by `hired_at <= cutoff` on purpose. Counting every hire without a
 * joining date would fire this warning for someone marked hired yesterday, whose
 * bonus is not owed for another three months — and a warning that is true every
 * night for benign reasons is one nobody reads by the time it matters. Only
 * hires old enough that day 90 has already passed represent a stalled payout.
 */
async function countAwaitingJoinDate(
  admin: SupabaseClient,
  jobIds: string[],
  now: Date,
): Promise<number> {
  if (jobIds.length === 0) return 0;
  const { count, error } = await admin
    .from("pipeline_candidates")
    .select("id", { count: "exact", head: true })
    .in("job_id", jobIds)
    .eq("status", "hired")
    .is("joined_at", null)
    .lte("hired_at", day90Cutoff(now));
  if (error) return 0;
  return count ?? 0;
}

export async function runDay90Sweep(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<Day90SweepResult> {
  const due = await findDueDay90Hires(admin, now);

  // `paid` counts ledger rows actually written, not hires visited. The sweep is
  // deliberately re-runnable and the unique index absorbs repeats, so counting
  // iterations would report the same "payouts" every night for hires paid months
  // ago — an overstatement of money moved, in the one feature whose whole premise
  // was that the ledger and reality had drifted apart.
  let processed = 0;
  let paid = 0;
  for (const hire of due) {
    processed += 1;
    // `?? 0` because a non-numeric result here would turn `paid` into NaN and
    // the run would report null rather than a count. Types rule it out; a money
    // figure is not where to rely on that alone.
    const written = await createMilestonePayouts({
      supabase: admin,
      candidateId: hire.candidateId,
      jobId: hire.jobId,
      triggerEvent: "day_90",
      // There is no new status here — the hire happened long ago. The
      // attribution bridge is told "hired" because that is what is true.
      attributionStatus: "hired",
    });
    paid += Number.isFinite(written) ? written : 0;
  }

  const { data: configs } = await admin
    .from("job_referral_config")
    .select("job_id")
    .eq("bonus_trigger", "day_90");
  const jobIds = (configs ?? []).map((c) => c.job_id as string).filter(Boolean);
  const skippedNoJoinDate = await countAwaitingJoinDate(admin, jobIds, now);

  if (skippedNoJoinDate > 0) {
    logger.warn("day-90 sweep: hires past day 90 have no joining date recorded", {
      skippedNoJoinDate,
    });
  }
  logger.info("day-90 referral sweep complete", {
    due: due.length,
    processed,
    paid,
    skippedNoJoinDate,
  });

  return { due: due.length, processed, paid, skippedNoJoinDate };
}
