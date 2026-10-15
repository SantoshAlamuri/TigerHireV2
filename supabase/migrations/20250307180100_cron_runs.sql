-- Audit table for cron job runs: start, end, status, error, rows processed.
-- Enables alerting on consecutive failures and debugging.
CREATE TABLE cron_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'success', 'failure')),
  error_message text,
  rows_processed int,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX idx_cron_runs_job_name ON cron_runs (job_name);
CREATE INDEX idx_cron_runs_started_at ON cron_runs (started_at DESC);

ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;

-- Only service role can insert/update/read (cron routes use admin).
CREATE POLICY "Service role can manage cron_runs"
  ON cron_runs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE cron_runs IS 'Audit of cron executions for alerting and debugging.';
