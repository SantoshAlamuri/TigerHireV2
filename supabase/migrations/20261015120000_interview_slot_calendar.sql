-- Interviews on real calendars: who else is on the panel, and whether the
-- event made it onto the organiser's calendar (so failures are visible).
BEGIN;

ALTER TABLE public.interview_availability_slots
  ADD COLUMN IF NOT EXISTS panel_user_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS calendar_sync_status text,
  ADD COLUMN IF NOT EXISTS calendar_sync_message text;

ALTER TABLE public.interview_availability_slots
  DROP CONSTRAINT IF EXISTS interview_availability_slots_calendar_sync_status_check;
ALTER TABLE public.interview_availability_slots
  ADD CONSTRAINT interview_availability_slots_calendar_sync_status_check
  CHECK (
    calendar_sync_status IS NULL
    OR calendar_sync_status IN ('synced', 'failed', 'not_connected', 'cancelled')
  );

COMMENT ON COLUMN public.interview_availability_slots.panel_user_ids IS
  'Other interviewers on this slot besides user_id (the organiser). Invited to the calendar event.';
COMMENT ON COLUMN public.interview_availability_slots.calendar_sync_status IS
  'Whether the booked interview was written to the organiser''s connected calendar.';

COMMIT;
