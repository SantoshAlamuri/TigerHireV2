import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { getJdBaseByJobId } from "@/lib/fitscore/hybrid/jd-base";
import { deletePendingJdApprovalPairs } from "@/lib/fitscore/pending-jd-approval";
import { enqueue } from "@/lib/jobs/queue";
import {
  MAX_RECONCILE_JOBS,
  RETRY_BACKOFF_MS,
  STUCK_ESCALATION_DAYS,
  type ReconcilerSummary,
} from "./screening-reconciler";

/**
 * Sweep C: `pending_jd_approval` rows that no longer describe reality.
 *
 * The table is a work queue: a pair is added when a candidate cannot be scored
 * because the job's rubric is unapproved, and should be removed once scored.
 * Two ways it goes wrong, and they need opposite repairs:
 *
 *   1. The pair IS scored but the row was never deleted — queue debris. Deleting
 *      it is the whole fix; re-running the reconcile would score nothing and the
 *      counter would read "stranded" forever. (Found on production: 276 rows on
 *      one Masai job, 43 days old, every one already scored.)
 *   2. The pair is genuinely unscored on an approved rubric — a real stray, so
 *      re-enqueue the per-job reconcile.
 *
 * Only case 2 is escalated when it persists; case 1 is silent housekeeping.
 */

type Pair = {
  job_id: string;
  candidate_id: string;
  enqueued_at: string | null;
  attempted_at: string | null;
};

export async function sweepStrandedPendingPairs(
  admin: SupabaseClient,
  summary: ReconcilerSummary,
  now: Date,
): Promise<void> {
  const { data: pairs, error } = await admin
    .from("pending_jd_approval")
    .select("job_id, candidate_id, enqueued_at, attempted_at")
    .limit(1000);
  if (error) {
    summary.errors.push(`pending pairs query: ${error.message}`);
    return;
  }

  const byJob = new Map<string, Pair[]>();
  for (const p of (pairs ?? []) as Pair[]) {
    const list = byJob.get(p.job_id) ?? [];
    list.push(p);
    byJob.set(p.job_id, list);
  }

  let enqueued = 0;
  for (const [jobId, jobPairs] of byJob) {
    try {
      // Which of these already have a score? Those rows are simply stale.
      const { data: scored, error: scoreErr } = await admin
        .from("fit_scores")
        .select("candidate_id")
        .eq("job_id", jobId)
        .in(
          "candidate_id",
          jobPairs.map((p) => p.candidate_id),
        );
      if (scoreErr) {
        summary.errors.push(`scored lookup ${jobId}: ${scoreErr.message}`);
        continue;
      }
      const scoredIds = new Set(
        (scored ?? []).map((r) => (r as { candidate_id: string }).candidate_id),
      );

      const drained = jobPairs.filter((p) => scoredIds.has(p.candidate_id));
      if (drained.length > 0) {
        await deletePendingJdApprovalPairs(
          admin,
          jobId,
          drained.map((p) => p.candidate_id),
        );
        summary.pairsCleared += drained.length;
        logger.info("whatsapp_reconciler_pending_pairs_cleared", {
          job_id: jobId,
          cleared: drained.length,
        });
      }

      const unscored = jobPairs.filter((p) => !scoredIds.has(p.candidate_id));
      if (unscored.length === 0) continue;

      const doc = await getJdBaseByJobId(admin, jobId);
      if (!doc?.approvedBy) continue; // waiting on a human — correct hold, not a stray
      summary.strandedPairsFound += unscored.length;

      if (enqueued >= MAX_RECONCILE_JOBS) continue;

      // Back off while a previous retry may still be running.
      const lastAttempt = unscored
        .map((p) => Date.parse(p.attempted_at ?? ""))
        .filter((t) => Number.isFinite(t))
        .sort((a, b) => b - a)[0];
      if (lastAttempt && now.getTime() - lastAttempt < RETRY_BACKOFF_MS) {
        summary.pairsAwaitingRetry += unscored.length;
        continue;
      }

      // The event id MUST differ from the approve route's (job+version), or
      // Inngest dedupes this against the original approval event and the retry
      // silently never runs. Bucket by hour: each sweep is its own event, while
      // concurrent instances of the same sweep still dedupe.
      const bucket = now.toISOString().slice(0, 13).replace(/[-T:]/g, "");
      await enqueue(
        "jd-base-approval-reconcile",
        { jobId, approvedByUserId: null },
        { id: `jd-base-approval-reconcile:${jobId}:${doc.version ?? 1}:recon-${bucket}` },
      );
      enqueued += 1;
      summary.reconcilesEnqueued += 1;
      try {
        await admin
          .from("pending_jd_approval")
          .update({ attempted_at: now.toISOString() })
          .eq("job_id", jobId);
      } catch (stampErr) {
        logger.warn("whatsapp_reconciler_attempt_stamp_failed", {
          job_id: jobId,
          error: stampErr instanceof Error ? stampErr.message : String(stampErr),
        });
      }

      const oldest = unscored
        .map((p) => Date.parse(p.enqueued_at ?? ""))
        .filter((t) => Number.isFinite(t))
        .sort((a, b) => a - b)[0];
      const stuckDays = oldest ? Math.floor((now.getTime() - oldest) / (24 * 60 * 60 * 1000)) : 0;
      if (stuckDays >= STUCK_ESCALATION_DAYS) {
        summary.stuckJobs.push({ jobId, pairs: unscored.length, ageDays: stuckDays });
        logger.error("whatsapp_reconciler_pending_pairs_stuck", {
          job_id: jobId,
          pair_count: unscored.length,
          oldest_age_days: stuckDays,
        });
      }
      logger.warn("whatsapp_reconciler_pending_pairs_reenqueued", {
        job_id: jobId,
        pair_count: unscored.length,
      });
    } catch (err) {
      summary.errors.push(
        `pending pair ${jobId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
