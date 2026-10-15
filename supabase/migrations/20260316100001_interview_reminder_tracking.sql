-- Track sent interview reminders to avoid duplicates
ALTER TABLE interview_availability_slots
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_interview_slots_reminder
  ON interview_availability_slots(start_at)
  WHERE status = 'booked' AND reminder_sent_at IS NULL;
