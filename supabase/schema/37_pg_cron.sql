-- Migration 37: pg_cron for reliable scheduled jobs
-- Source: V5 Supplementary G5
-- Requires: Supabase Pro plan

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- JOB 1: Process pending resignations — every 30 minutes
-- (48hr window is legally time-sensitive — must not miss)
SELECT cron.schedule(
  'process-resignations',
  '*/30 * * * *',
  $$SELECT process_pending_resignations()$$
);

-- JOB 2: Trust score recalculation — daily at 3am IST (9:30pm UTC)
SELECT cron.schedule(
  'trust-recalc',
  '30 21 * * *',
  $$SELECT recalculate_all_trust_scores()$$
);

-- JOB 3: Data retention cleanup — weekly Sunday 2am IST (8:30pm UTC Saturday)
SELECT cron.schedule(
  'retention-cleanup',
  '30 20 * * 0',
  $$
    UPDATE candidates SET
      phone = null, email = null, full_name = '[RETENTION_ERASED]',
      cv_raw_text = null, cv_parsed_json = null,
      embedding = null, erased_at = now()
    WHERE
      last_active_at < now() - interval '2 years'
      AND erased_at IS NULL;
  $$
);

-- JOB 4: Agent log cleanup — keep only 90 days
SELECT cron.schedule(
  'log-cleanup',
  '0 22 * * 0',
  $$DELETE FROM agent_logs WHERE created_at < now() - interval '90 days'$$
);

-- JOB 5: Rate limit log cleanup — hourly
SELECT cron.schedule(
  'rate-limit-cleanup',
  '0 * * * *',
  $$DELETE FROM rate_limit_log WHERE created_at < now() - interval '1 hour'$$
);
