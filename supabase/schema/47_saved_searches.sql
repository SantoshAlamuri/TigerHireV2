-- Saved searches and job alerts for candidates.
-- Candidates can save search criteria and opt-in to email digests.

BEGIN;

CREATE TABLE saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}',
  alert_enabled boolean NOT NULL DEFAULT false,
  alert_frequency text NOT NULL DEFAULT 'weekly'
    CHECK (alert_frequency IN ('daily', 'weekly', 'never')),
  last_alerted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_searches_user ON saved_searches (user_id);
CREATE INDEX idx_saved_searches_alert ON saved_searches (alert_enabled, alert_frequency)
  WHERE alert_enabled = true;

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own saved searches"
  ON saved_searches FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE saved_searches IS 'User saved search criteria with optional email alert subscriptions';
COMMENT ON COLUMN saved_searches.filters IS 'JSON: {role_function?, seniority?, location?, remote?, skills?, salary_min?, salary_max?}';

COMMIT;
