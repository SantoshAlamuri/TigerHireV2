-- Race-safe payout ledger: enforce one payout row per (candidate, referrer, trigger_event).
--
-- The application previously did a check-then-insert with no DB constraint, so two
-- concurrent triggers (e.g. duplicate status-change events) could both pass the
-- existence check and insert duplicate payout rows — a double-payout risk. This adds
-- the unique index that backs an ON CONFLICT DO NOTHING upsert in the application.
--
-- Natural key matches the application's idempotency key and the insert payload:
--   (candidate_id, referrer_id, trigger_event)
-- referrer_level is intentionally excluded so a referrer cannot be paid twice for the
-- same candidate + milestone via distinct levels.

-- Collapse any pre-existing duplicates (keep the earliest row) so the unique index
-- can be created. No-op when there are none.
DELETE FROM payout_ledger pl
USING payout_ledger keep
WHERE pl.candidate_id = keep.candidate_id
  AND pl.referrer_id = keep.referrer_id
  AND pl.trigger_event = keep.trigger_event
  AND pl.created_at > keep.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_ledger_candidate_referrer_event
  ON payout_ledger (candidate_id, referrer_id, trigger_event);

COMMENT ON INDEX uq_payout_ledger_candidate_referrer_event IS
  'Idempotency / double-payout guard: one payout row per candidate + referrer + trigger_event.';
