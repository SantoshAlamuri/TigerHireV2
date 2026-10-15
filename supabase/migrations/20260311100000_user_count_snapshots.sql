-- User count monitoring: stores daily snapshots to detect unexpected user deletions.
-- Used by /api/cron/user-count-monitor to alert if user count drops significantly.

CREATE TABLE IF NOT EXISTS user_count_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_count integer NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);

-- Only service role writes to this table
ALTER TABLE user_count_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read snapshots"
  ON user_count_snapshots FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- Index for cleanup query
CREATE INDEX IF NOT EXISTS idx_user_count_snapshots_checked_at
  ON user_count_snapshots (checked_at);
