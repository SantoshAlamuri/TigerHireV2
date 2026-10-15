-- Performance indexes for FitScore batch scoring queries
-- Speeds up batchRecentScoreKeys() and skipIfScoredRecently() in fitscore-agent

CREATE INDEX IF NOT EXISTS idx_fit_scores_job_candidate_created
  ON fit_scores (job_id, candidate_id, created_at DESC);

-- Index for candidate monthly score count (free-tier limit check)
CREATE INDEX IF NOT EXISTS idx_fit_scores_candidate_created
  ON fit_scores (candidate_id, created_at DESC);

-- Index for open jobs lookup in batch agent
CREATE INDEX IF NOT EXISTS idx_jobs_status
  ON jobs (status) WHERE status = 'open';
