-- Brief 8 Phase B.2: per-channel invite delivery tracking on booked slots (ICS-first path).

ALTER TABLE public.interview_availability_slots
  ADD COLUMN IF NOT EXISTS candidate_email_status text,
  ADD COLUMN IF NOT EXISTS interviewer_email_status text,
  ADD COLUMN IF NOT EXISTS candidate_whatsapp_status text,
  ADD COLUMN IF NOT EXISTS last_delivery_attempt_at timestamptz;

ALTER TABLE public.interview_availability_slots
  DROP CONSTRAINT IF EXISTS interview_slots_candidate_email_status_check;

ALTER TABLE public.interview_availability_slots
  ADD CONSTRAINT interview_slots_candidate_email_status_check
  CHECK (
    candidate_email_status IS NULL
    OR candidate_email_status IN ('sent', 'failed', 'resent')
  );

ALTER TABLE public.interview_availability_slots
  DROP CONSTRAINT IF EXISTS interview_slots_interviewer_email_status_check;

ALTER TABLE public.interview_availability_slots
  ADD CONSTRAINT interview_slots_interviewer_email_status_check
  CHECK (
    interviewer_email_status IS NULL
    OR interviewer_email_status IN ('sent', 'failed', 'resent')
  );

ALTER TABLE public.interview_availability_slots
  DROP CONSTRAINT IF EXISTS interview_slots_candidate_whatsapp_status_check;

ALTER TABLE public.interview_availability_slots
  ADD CONSTRAINT interview_slots_candidate_whatsapp_status_check
  CHECK (
    candidate_whatsapp_status IS NULL
    OR candidate_whatsapp_status IN ('sent', 'failed', 'resent', 'not_applicable')
  );

COMMENT ON COLUMN public.interview_availability_slots.candidate_email_status IS
  'Booked-invite delivery: null before first attempt; sent | failed | resent.';
COMMENT ON COLUMN public.interview_availability_slots.interviewer_email_status IS
  'Interviewer ICS+email delivery for booked slot.';
COMMENT ON COLUMN public.interview_availability_slots.candidate_whatsapp_status IS
  'Candidate WhatsApp when channel enabled; not_applicable when WA not required.';
COMMENT ON COLUMN public.interview_availability_slots.last_delivery_attempt_at IS
  'Last attempt to deliver critical booked invites (initial book or resend).';
