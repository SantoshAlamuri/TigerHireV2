-- FitScore: per candidate–job score. v2 = 5 dimensions (30/25/20/15/10) + red_flags, interview_angles, ai_recommendation.

CREATE TABLE fit_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  overall_score smallint NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  skills_score smallint CHECK (skills_score >= 0 AND skills_score <= 100),
  experience_score smallint CHECK (experience_score >= 0 AND experience_score <= 100),
  dimensions jsonb,
  summary text,
  green_flags text[],
  amber_flags text[],
  red_flags text[],
  interview_angles text[],
  ai_recommendation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fit_scores_job_candidate_unique UNIQUE (job_id, candidate_id)
);

CREATE INDEX idx_fit_scores_job_id ON fit_scores (job_id);
CREATE INDEX idx_fit_scores_candidate_id ON fit_scores (candidate_id);
CREATE INDEX idx_fit_scores_overall_score ON fit_scores (job_id, overall_score DESC);

COMMENT ON TABLE fit_scores IS 'FitScore per job–candidate pair. v2: dimensions (skills/experience/seniority/location/freshness), red_flags, interview_angles, ai_recommendation.';
