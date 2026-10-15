-- Email preferences: per-user email notification settings.

BEGIN;

CREATE TABLE email_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  marketing boolean NOT NULL DEFAULT true,
  job_alerts boolean NOT NULL DEFAULT true,
  application_updates boolean NOT NULL DEFAULT true,
  messages boolean NOT NULL DEFAULT true,
  interview_reminders boolean NOT NULL DEFAULT true,
  weekly_digest boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_preferences_user_unique UNIQUE (user_id)
);

CREATE INDEX idx_email_preferences_user ON email_preferences (user_id);

ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own email preferences"
  ON email_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE email_preferences IS 'Per-user email notification preferences. All default to true (opt-out model).';

COMMIT;
