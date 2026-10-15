-- WhatsApp CV Flow V2: Q&A steps, alert subscription window, per-candidate alert rate limit

ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS qa_step INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alerts_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alert_last_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN whatsapp_sessions.qa_step IS 'Lane B: index 0-4 = next question to ask; 5 = Q&A complete';
COMMENT ON COLUMN whatsapp_sessions.alerts_expires_at IS 'When active_alerts subscription ends (e.g. +6 months)';
COMMENT ON COLUMN whatsapp_sessions.alert_last_sent_at IS 'Last th_new_role_alert send; 24h rate limit';
