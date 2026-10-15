-- Optimistic concurrency control for whatsapp_sessions (P1).
--
-- Problem: the inbound message handler does SELECT → decide → UPDATE without a
-- version check. Two inbound messages from the same phone delivered to
-- different Vercel isolates within milliseconds will both read the same
-- session row, both decide independently, and both write — corrupting the
-- state machine (vouch_q2 → vouch_q4 skipping q3, duplicate consent rows,
-- lost context).
--
-- Fix: add a monotonically increasing `version` column. Every update must
-- pass the expected version; the UPDATE WHERE phone = $1 AND version = $v
-- silently no-ops on conflict so the caller can retry against fresh state.
--
-- Backwards-safe: DEFAULT 0 backfills existing rows; new rows start at 0.
-- IF NOT EXISTS keeps the migration idempotent.

BEGIN;

ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.whatsapp_sessions.version IS
  'Monotonically increasing version for optimistic concurrency control. Bumped on every successful updateSession call; readers pass the observed version as expectedVersion to detect concurrent writes.';

COMMIT;
