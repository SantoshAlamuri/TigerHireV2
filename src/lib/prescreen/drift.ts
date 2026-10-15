import {
  prescreenPendingSweepBufferHours,
  prescreenReminderHours,
  prescreenTimeoutHours,
} from "./config";

/**
 * The prescreen machine is deterministic: invite → collect → remind (24h) → close (48h,
 * +6h safety sweep). Drift is an OPEN session sitting past one of those deadlines — it
 * means a reminder dispatch silently failed or a lifecycle cron missed the session.
 * A session the machine already closed (including timeouts) is the machine working.
 */
export type PostShortlistDrift = "reminder_overdue" | "close_overdue";

export interface DriftSessionFields {
  state: string;
  questions_sent_at: string | null;
  reminder_sent_at: string | null;
  created_at: string | null;
}

/** Cron-cadence slack: a deadline only counts as missed once it is past by this much. */
const DRIFT_GRACE_HOURS = 3;

export function classifyPostShortlistDrift(
  session: DriftSessionFields,
  nowMs: number,
): PostShortlistDrift | null {
  if (session.state === "complete") return null;

  const anchorMs = Date.parse(session.questions_sent_at ?? session.created_at ?? "");
  if (!Number.isFinite(anchorMs)) return null;
  const hoursOpen = (nowMs - anchorMs) / 3_600_000;

  const closeDeadline =
    prescreenTimeoutHours() + prescreenPendingSweepBufferHours() + DRIFT_GRACE_HOURS;
  if (hoursOpen > closeDeadline) return "close_overdue";

  // Reminder drift only applies once questions actually went out — consent-stage
  // sessions have no reminder deadline, only the close deadline above.
  if (
    !session.reminder_sent_at &&
    session.questions_sent_at &&
    hoursOpen > prescreenReminderHours() + DRIFT_GRACE_HOURS
  ) {
    return "reminder_overdue";
  }

  return null;
}
