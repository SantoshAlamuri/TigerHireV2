-- Add clean dimension storage
ALTER TABLE fit_scores
  ADD COLUMN IF NOT EXISTS dimensions_json JSONB,
  ADD COLUMN IF NOT EXISTS dimension_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(20) DEFAULT 'dimensions-v1.0';

-- Index for querying
CREATE INDEX IF NOT EXISTS idx_fit_scores_dimensions ON fit_scores(dimensions_json)
  WHERE dimensions_json IS NOT NULL;
