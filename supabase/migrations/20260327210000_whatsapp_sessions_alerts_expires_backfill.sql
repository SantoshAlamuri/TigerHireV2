-- Backfill alerts_expires_at for Lane B subscribers where expiry was never persisted
-- (legacy or partial rows). NULL remains "not configured" for new logic; this fixes
-- rows that were already in active_alerts without an expiry timestamp.

UPDATE whatsapp_sessions
SET alerts_expires_at = now() + interval '6 months'
WHERE session_state = 'active_alerts'
  AND alerts_expires_at IS NULL;
