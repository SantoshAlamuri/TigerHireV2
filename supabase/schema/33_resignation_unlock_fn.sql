-- Migration 33: 48-hour resignation unlock function
-- Source: PRD V5 Section 3.1
-- Scheduled via pg_cron (see migration 37) every 30 minutes

CREATE OR REPLACE FUNCTION process_pending_resignations()
RETURNS void AS $$
BEGIN
  -- Unlock candidate profiles where 48h has passed and no dispute
  UPDATE candidates c
  SET
    employment_status = 'alumni',
    profile_unlocked_at = now()
  FROM resignation_events re
  WHERE
    re.candidate_id = c.id
    AND re.disputed = false
    AND re.profile_unlock_scheduled_at <= now()
    AND re.profile_unlocked_at IS NULL
    AND c.employment_status = 'resigned';

  -- Mark resignation events as completed
  UPDATE resignation_events
  SET profile_unlocked_at = now()
  WHERE
    disputed = false
    AND profile_unlock_scheduled_at <= now()
    AND profile_unlocked_at IS NULL;
END;
$$ LANGUAGE plpgsql;
