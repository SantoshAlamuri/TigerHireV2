-- Prescreen gate: add 'awaiting_consent' session state.
-- Cold WhatsApp numbers (no open 24h session window) get the approved
-- th_screening_invite template first; the session waits in 'awaiting_consent'
-- until the candidate replies YES, then questions are sent as session text.
ALTER TABLE public.prescreen_sessions
  DROP CONSTRAINT IF EXISTS prescreen_sessions_state_check;

ALTER TABLE public.prescreen_sessions
  ADD CONSTRAINT prescreen_sessions_state_check
  CHECK (state IN ('awaiting_consent', 'awaiting_reply', 'reminded', 'complete'));
