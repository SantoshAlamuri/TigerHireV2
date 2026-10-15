/**
 * Max number of role matches shown in WhatsApp/workflow flows (e.g. "Reply 1 to N to apply").
 * Override with env TOP_MATCHES_LIMIT to scale beyond default (e.g. 10, 15, 20).
 */
const DEFAULT_TOP_MATCHES_LIMIT = 10;

export const TOP_MATCHES_LIMIT = (() => {
  const raw = process.env.TOP_MATCHES_LIMIT;
  if (raw == null || raw === "") return DEFAULT_TOP_MATCHES_LIMIT;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_TOP_MATCHES_LIMIT;
  return Math.min(Math.max(n, 1), 20); // clamp 1–20 for UX
})();

/**
 * Minimum overall_score to show a job to the candidate (e.g. 60 or 70).
 * Only matches at or above this are shown; jobs are ordered by score so best match first.
 * Env: FITSCORE_MIN_CONFIDENCE (default 60).
 */
const DEFAULT_MIN_THRESHOLD = 60;

export const FITSCORE_MIN_THRESHOLD = (() => {
  const raw = process.env.FITSCORE_MIN_CONFIDENCE;
  if (raw == null || raw === "") return DEFAULT_MIN_THRESHOLD;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return DEFAULT_MIN_THRESHOLD;
  return Math.min(Math.max(n, 0), 100);
})();

/**
 * Max number of open jobs Scout scores per CV (paid service: can afford more API calls).
 * Env: SCOUT_JOBS_LIMIT (default 50). Higher = more relevant jobs considered, more FitScore API cost.
 */
const DEFAULT_SCOUT_JOBS_LIMIT = 50;

export const SCOUT_JOBS_LIMIT = (() => {
  const raw = process.env.SCOUT_JOBS_LIMIT;
  if (raw == null || raw === "") return DEFAULT_SCOUT_JOBS_LIMIT;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_SCOUT_JOBS_LIMIT;
  return Math.min(Math.max(n, 1), 200);
})();

/** Lane A / alerts: same gate as match surfacing unless overridden. */
export const STRONG_MATCH_THRESHOLD = FITSCORE_MIN_THRESHOLD;

/** Subscription length for `active_alerts` after immediate match or no-match subscribe. */
export const ALERT_SUBSCRIPTION_MONTHS = 6;

/** Lane B immediate match: max jobs to score before taking top N. */
export const MAX_IMMEDIATE_MATCH_JOBS = 10;

export const MAX_IMMEDIATE_MATCHES_TO_SHOW = 3;

/** Min hours between `th_new_role_alert` per candidate (whatsapp_sessions.alert_last_sent_at). */
export const MAX_ALERT_GAP_HOURS = 24;
