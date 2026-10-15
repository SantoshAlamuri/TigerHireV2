-- Candidate job preferences: location, remote, seniority, role type, salary range.
-- When set, Scout and match lists use these to show relevant opportunities first.

CREATE TABLE candidate_preferences (
  candidate_id uuid PRIMARY KEY REFERENCES candidates (id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidate_preferences_updated ON candidate_preferences (updated_at DESC);

COMMENT ON TABLE candidate_preferences IS 'Candidate-set preferences for job matching: locations, remote, seniority, role_function, salary range. Used by Scout and match listing.';
COMMENT ON COLUMN candidate_preferences.preferences IS 'JSON: preferred_locations?: string[], remote_preference?: "remote"|"hybrid"|"onsite"|"any", preferred_seniority?: string[], preferred_role_functions?: string[], salary_min_lpa?: number, salary_max_lpa?: number';

ALTER TABLE candidate_preferences ENABLE ROW LEVEL SECURITY;

-- Candidates can read/update only their own preferences (via candidate_id → candidates.user_id).
CREATE POLICY "Candidates can read own preferences"
  ON candidate_preferences FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM candidates c
      WHERE c.id = candidate_preferences.candidate_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can insert own preferences"
  ON candidate_preferences FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM candidates c
      WHERE c.id = candidate_preferences.candidate_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can update own preferences"
  ON candidate_preferences FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM candidates c
      WHERE c.id = candidate_preferences.candidate_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM candidates c
      WHERE c.id = candidate_preferences.candidate_id
        AND c.user_id = auth.uid()
    )
  );

-- Service role can upsert for WhatsApp-only candidates (no user_id).
-- RLS allows candidate-linked users; admin bypass applies for server-side upsert.
