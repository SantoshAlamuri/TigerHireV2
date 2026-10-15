/** Prescreen timing knobs. Hours; env-overridable for fast-timeout soaks. */

function numEnv(name: string, fallbackHours: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallbackHours;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallbackHours;
}

/** Hours after questions sent before a single reminder is sent. */
export function prescreenReminderHours(): number {
  return numEnv("PRESCREEN_REMINDER_HOURS", 24);
}

/** Hours after questions sent before the gate times out -> unverified + score. */
export function prescreenTimeoutHours(): number {
  return numEnv("PRESCREEN_TIMEOUT_HOURS", 48);
}

/** Extra hours past timeout before the safety-net cron force-resolves a pending row. */
export function prescreenPendingSweepBufferHours(): number {
  return numEnv("PRESCREEN_PENDING_SWEEP_BUFFER_HOURS", 6);
}

/**
 * Minimum gap (ms) between two accepted inbound prescreen answers for the same
 * session. A reply landing inside this window after the previous accepted answer
 * is treated as a rapid duplicate / double-tap and ignored, so one tap can never
 * auto-fill the next (unseen) question. Env-overridable; small by design.
 */
export function prescreenDuplicateReplyGuardMs(): number {
  const raw = process.env.PRESCREEN_DUPLICATE_REPLY_GUARD_MS;
  if (raw === undefined || raw === "") return 1500;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 1500;
}
