-- Advance WhatsApp sessions stuck in pre-CV states when full consent is already on file.
-- Matches syncSessionWithConsent() in application code (four consent types).

UPDATE public.whatsapp_sessions ws
SET
  session_state = 'cv_requested',
  last_message_at = now()
WHERE ws.session_state IN ('awaiting_consent', 'new', 'consent_given')
  AND (
    SELECT count(DISTINCT cr.consent_type)::int
    FROM public.consent_records cr
    WHERE cr.phone = ws.phone
      AND cr.consent_given = true
      AND cr.consent_type IN (
        'cv_processing',
        'profile_storage',
        'recruiter_visibility',
        'whatsapp_communication'
      )
  ) = 4;

-- Operator-known test / prod lines (idempotent; safe if already cv_requested).
UPDATE public.whatsapp_sessions
SET
  session_state = 'cv_requested',
  last_message_at = now()
WHERE session_state = 'awaiting_consent'
  AND phone IN ('917569537492', '919885674488', '919441352348');
