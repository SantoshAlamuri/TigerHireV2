-- Preserve score history by superseding old active rows instead of updating in place.
ALTER TABLE fit_scores
ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

ALTER TABLE fit_scores
ADD COLUMN IF NOT EXISTS superseded_by_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fit_scores_superseded_by_fk'
  ) THEN
    ALTER TABLE fit_scores
    ADD CONSTRAINT fit_scores_superseded_by_fk
    FOREIGN KEY (superseded_by_id)
    REFERENCES fit_scores(id)
    ON DELETE SET NULL;
  END IF;
END $$;

DROP INDEX IF EXISTS fit_scores_job_candidate_production_unique;

CREATE UNIQUE INDEX IF NOT EXISTS fit_scores_job_candidate_active_unique
  ON fit_scores (job_id, candidate_id)
  WHERE is_test_run = false AND superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fit_scores_superseded_at
  ON fit_scores (superseded_at);
