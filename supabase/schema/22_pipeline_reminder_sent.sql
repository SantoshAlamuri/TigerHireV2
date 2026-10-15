-- Avoid sending duplicate interview reminders: track when reminder was sent.
ALTER TABLE pipeline_candidates
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_pipeline_candidates_reminder_sent
  ON pipeline_candidates (interview_scheduled_at)
  WHERE interview_scheduled_at IS NOT NULL AND reminder_sent_at IS NULL;

COMMENT ON COLUMN pipeline_candidates.reminder_sent_at IS 'Set by cron/reminders when 1h-before WhatsApp reminder is sent';
