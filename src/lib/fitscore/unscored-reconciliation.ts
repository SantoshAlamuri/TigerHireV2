import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { enqueue } from "@/lib/jobs/queue";

/**
 * Reconciliation for the product's core guarantee: every applicant gets scored.
 *
 * Several paths can drop a candidate without leaving a fit_score row — a failed
 * lock acquire, a budget-gate trip, an enqueue no-op, a truncated inline batch,
 * or an Inngest run that died mid-flight. Before this sweep nothing in the system
 * ever asked "which applicants have no score?", so every such drop was permanent
 * and invisible.
 *
 * This finds application rows whose (job, candidate) pair has no active fit_score
 * and re-enqueues them, oldest first. It deliberately does not score inline —
 * requeueing keeps the cron cheap and lets the normal retry/DLQ machinery apply.
 */

export interface UnscoredReconciliationResult {
  scanned: number;
  requeued: number;
  failed: number;
  /** Pairs still unscored after the requeue attempt — surfaced for alerting. */
  outstanding: number;
  /** Pairs skipped because they exceeded MAX_ATTEMPTS — need human attention. */
  exhausted: number;
}

interface ApplicationRow {
  id: string;
  job_id: string | null;
  candidate_id: string | null;
  created_at: string;
}

/** Grace period: never chase an application that is still mid-flight. */
const MIN_AGE_MINUTES = 30;
/**
 * Stop re-enqueueing a pair that keeps failing. Without this a permanently
 * unscoreable candidate (no CV text, knockout, unapproved rubric) would be
 * requeued every run forever, amplifying LLM spend.
 */
const MAX_ATTEMPTS = 3;

export async function reconcileUnscoredApplications(
  supabase: SupabaseClient,
  options: { limit?: number } = {},
): Promise<UnscoredReconciliationResult> {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000);
  const cutoffIso = new Date(Date.now() - MIN_AGE_MINUTES * 60_000).toISOString();

  // Newest-first. An earlier version scanned oldest-first with no cursor, so once
  // the table exceeded `limit` the sweep re-checked the same already-scored rows
  // every run and never reached newer gaps — the safety net expired silently.
  // Newest-first means a fresh drop is always caught; older gaps are reached as
  // newer ones resolve, and `outstanding` surfaces a persistent backlog.
  const { data: apps, error: appErr } = await supabase
    .from("applications")
    .select("id, job_id, candidate_id, created_at")
    .not("job_id", "is", null)
    .not("candidate_id", "is", null)
    .lt("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (appErr) {
    logger.error("unscored_reconciliation_query_failed", { error: String(appErr.message) });
    throw new Error(appErr.message);
  }

  const rows = (apps ?? []) as ApplicationRow[];
  if (rows.length === 0)
    return { scanned: 0, requeued: 0, failed: 0, outstanding: 0, exhausted: 0 };

  const jobIds = [...new Set(rows.map((r) => r.job_id).filter((v): v is string => Boolean(v)))];
  const candidateIds = [
    ...new Set(rows.map((r) => r.candidate_id).filter((v): v is string => Boolean(v))),
  ];

  const { data: scores, error: scoreErr } = await supabase
    .from("fit_scores")
    .select("job_id, candidate_id")
    .in("job_id", jobIds)
    .in("candidate_id", candidateIds)
    // `fit_scores` has no is_active column — current scores are the ones not
    // superseded and not test runs. An earlier version filtered on is_active and
    // therefore threw 42703 on EVERY run, so this sweep never executed once.
    .is("superseded_at", null)
    .eq("is_test_run", false);

  if (scoreErr) {
    logger.error("unscored_reconciliation_scores_failed", { error: String(scoreErr.message) });
    throw new Error(scoreErr.message);
  }

  const scored = new Set(
    (scores ?? []).map(
      (s) => `${(s as { job_id: string }).job_id}:${(s as { candidate_id: string }).candidate_id}`,
    ),
  );

  const missing = rows.filter((r) => !scored.has(`${r.job_id}:${r.candidate_id}`));

  // Skip pairs that have already failed repeatedly — otherwise an unscoreable
  // candidate is re-enqueued on every run.
  const { data: attemptRows } = await supabase
    .from("fitscore_reconciliation_attempts")
    .select("job_id, candidate_id, attempts")
    .in("job_id", jobIds)
    .in("candidate_id", candidateIds);
  const attemptsByPair = new Map(
    (attemptRows ?? []).map((r) => {
      const row = r as { job_id: string; candidate_id: string; attempts: number };
      return [`${row.job_id}:${row.candidate_id}`, row.attempts];
    }),
  );

  let requeued = 0;
  let failed = 0;
  let exhausted = 0;
  for (const row of missing) {
    const key = `${row.job_id}:${row.candidate_id}`;
    if ((attemptsByPair.get(key) ?? 0) >= MAX_ATTEMPTS) {
      exhausted += 1;
      continue;
    }
    const enq = await enqueue("fit-score-single", {
      jobId: row.job_id as string,
      candidateId: row.candidate_id as string,
    });
    await supabase.rpc("bump_fitscore_reconciliation_attempt", {
      p_job_id: row.job_id as string,
      p_candidate_id: row.candidate_id as string,
    });
    if (enq.id) {
      requeued += 1;
    } else {
      failed += 1;
      logger.warn("unscored_reconciliation_enqueue_noop", {
        jobId: row.job_id,
        candidateId: row.candidate_id,
      });
    }
  }

  if (missing.length > 0) {
    logger.warn("unscored_reconciliation_found_gaps", {
      scanned: rows.length,
      missing: missing.length,
      requeued,
      failed,
      exhausted,
    });
  }

  return {
    scanned: rows.length,
    requeued,
    failed,
    outstanding: missing.length,
    exhausted,
  };
}
