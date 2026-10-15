import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

/**
 * WhatsApp screening reconciler.
 *
 * The screening interview is event-driven: each step fires exactly once,
 * triggered by the previous one. A missed trigger — webhook hiccup, deploy
 * mid-message, a blocked send — therefore strands the candidate SILENTLY:
 * nothing retries, nothing reports. This sweep runs on a schedule, checks the
 * state machine's invariants, and repairs strays idempotently:
 *
 *   A. armed session, nothing sent or heard for hours -> re-kick the collection
 *      (in-window: re-asks the current question; out-of-window: utility opener)
 *   B. all questions answered but applications.gate_status never recorded
 *      -> evaluate the canonical gate and record it
 *   C. pending_jd_approval pairs whose JD is ALREADY approved (the approval
 *      reconcile missed them) -> re-enqueue the per-job reconcile
 *
 * Every repair is capped per sweep, logged under a distinct event name, and the
 * run summary is written to agent_logs (visible on /admin/agents).
 */

/** Re-kick an armed session only after this much silence. */
export const STALLED_SESSION_AFTER_MS = 6 * 60 * 60 * 1000;
/** Never nudge the same phone more than once per Meta conversation window. */
export const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** Ignore sessions older than this — the candidate is gone; don't nag forever. */
export const STALLED_SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const GATE_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

export const MAX_SESSION_REPAIRS = 25;
export const MAX_GATE_EVALUATIONS = 50;
export const MAX_RECONCILE_JOBS = 10;
/** Don't re-enqueue a job's reconcile while a previous retry may still be running. */
export const RETRY_BACKOFF_MS = 6 * 60 * 60 * 1000;
/** Pairs older than this have outlived several retries — escalate, don't just retry. */
export const STUCK_ESCALATION_DAYS = 7;

export interface ReconcilerSummary {
  stalledSessionsFound: number;
  sessionsRepaired: number;
  sessionsSkippedCooldown: number;
  sessionsSkippedCallingWindow: number;
  gatesEvaluated: number;
  gatesRecorded: number;
  strandedPairsFound: number;
  reconcilesEnqueued: number;
  pairsAwaitingRetry: number;
  /** Stale queue rows deleted because the pair was already scored. */
  pairsCleared: number;
  /** Jobs whose pairs have survived a week of retries — a human must look. */
  stuckJobs: Array<{ jobId: string; pairs: number; ageDays: number }>;
  errors: string[];
}

/** Pure decision: is this armed session stalled and eligible for a nudge? */
export function isSessionNudgeDue(args: {
  lastMessageAt: string | null;
  createdAt: string | null;
  lastOutboundAt: string | null;
  now?: Date;
}): "due" | "not_stalled" | "cooldown" | "too_old" {
  const now = (args.now ?? new Date()).getTime();
  const lastActivity = Date.parse(args.lastMessageAt ?? args.createdAt ?? "");
  if (!Number.isFinite(lastActivity)) return "not_stalled";
  if (now - lastActivity < STALLED_SESSION_AFTER_MS) return "not_stalled";
  const born = Date.parse(args.createdAt ?? args.lastMessageAt ?? "");
  if (Number.isFinite(born) && now - born > STALLED_SESSION_MAX_AGE_MS) return "too_old";
  if (args.lastOutboundAt) {
    const lastOutbound = Date.parse(args.lastOutboundAt);
    if (Number.isFinite(lastOutbound) && now - lastOutbound < NUDGE_COOLDOWN_MS) {
      return "cooldown";
    }
  }
  return "due";
}

export async function runScreeningReconciler(
  admin: SupabaseClient,
  opts?: { now?: Date },
): Promise<ReconcilerSummary> {
  const now = opts?.now ?? new Date();
  const summary: ReconcilerSummary = {
    stalledSessionsFound: 0,
    sessionsRepaired: 0,
    sessionsSkippedCooldown: 0,
    sessionsSkippedCallingWindow: 0,
    gatesEvaluated: 0,
    gatesRecorded: 0,
    strandedPairsFound: 0,
    reconcilesEnqueued: 0,
    pairsAwaitingRetry: 0,
    pairsCleared: 0,
    stuckJobs: [],
    errors: [],
  };

  const { sweepStalledSessions, sweepUnrecordedGates } =
    await import("./screening-reconciler-sweeps");
  const { sweepStrandedPendingPairs } = await import("./screening-reconciler-pairs");
  await sweepStalledSessions(admin, summary, now);
  await sweepUnrecordedGates(admin, summary, now);
  await sweepStrandedPendingPairs(admin, summary, now);

  logger.info("metric.whatsapp_screening_reconciler_run", { ...summary });
  try {
    await admin.from("agent_logs").insert({
      agent_name: "whatsapp_screening_reconciler",
      run_id: `wsr_${now.getTime()}`,
      status: summary.errors.length > 0 ? "completed_with_errors" : "completed",
      payload: summary as unknown as Record<string, unknown>,
    });
  } catch (err) {
    logger.warn("whatsapp_reconciler_agent_log_write_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return summary;
}
