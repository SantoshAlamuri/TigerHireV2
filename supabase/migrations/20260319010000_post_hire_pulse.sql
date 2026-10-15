-- Post-Hire Pulse: track 30/60/90-day check-ins with hiring managers after a candidate is hired.

CREATE TABLE IF NOT EXISTS post_hire_pulse_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_candidate_id uuid NOT NULL REFERENCES pipeline_candidates (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  hiring_manager_id uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  check_in_day integer NOT NULL CHECK (check_in_day IN (30, 60, 90)),
  sent_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  response text CHECK (response IN ('excellent', 'good', 'average', 'poor', 'left')),
  response_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_post_hire_pulse_pipeline_candidate ON post_hire_pulse_responses (pipeline_candidate_id);
CREATE INDEX idx_post_hire_pulse_job_candidate ON post_hire_pulse_responses (job_id, candidate_id);
CREATE INDEX idx_post_hire_pulse_sent_at ON post_hire_pulse_responses (sent_at) WHERE sent_at IS NOT NULL;
CREATE INDEX idx_post_hire_pulse_responded_at ON post_hire_pulse_responses (responded_at) WHERE responded_at IS NULL;

COMMENT ON TABLE post_hire_pulse_responses IS '30/60/90-day post-hire check-ins with hiring managers to track hire quality and feed FitScore calibration';

-- RLS: only service role can manage pulse responses
ALTER TABLE post_hire_pulse_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage post-hire pulse"
  ON post_hire_pulse_responses FOR ALL
  USING (auth.role() = 'service_role');
