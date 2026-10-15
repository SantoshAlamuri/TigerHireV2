-- WhatsApp conversation state for CV drop, vouch flow, slot selection.

CREATE TABLE whatsapp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  session_state text NOT NULL DEFAULT 'new',
  context jsonb NOT NULL DEFAULT '{}',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_sessions_phone ON whatsapp_sessions (phone);
CREATE INDEX idx_whatsapp_sessions_state ON whatsapp_sessions (session_state);

COMMENT ON TABLE whatsapp_sessions IS 'Session state: new | cv_requested | cv_received | scored | vouch_q1..q5 | slot_selection | complete';
COMMENT ON COLUMN whatsapp_sessions.context IS 'Stores document_id, referral_id, candidate_id, slots, etc.';
