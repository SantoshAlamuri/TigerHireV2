-- Delta #4: write-once hired_at timestamp on pipeline_candidates.
--
-- The post-hire pulse scheduler (30/60/90-day Quality-of-Hire survey) previously keyed
-- off pipeline_candidates.updated_at, which is mutated by ANY status touch, so milestone
-- eligibility drifted and re-touches could shift a candidate out of the target window.
-- hired_at is set exactly once, the first time status becomes 'hired', and is never
-- overwritten thereafter (survives un-hire / re-hire), giving the scheduler a stable
-- "hire date" to measure 30/60/90 days from.

ALTER TABLE pipeline_candidates
  ADD COLUMN IF NOT EXISTS hired_at timestamptz;

COMMENT ON COLUMN pipeline_candidates.hired_at IS
  'Write-once timestamp of when this candidate first reached status = hired. Set by trigger set_pipeline_candidate_hired_at; source of truth for post-hire pulse (30/60/90-day) scheduling.';

-- Set hired_at write-once whenever status becomes 'hired' (on INSERT or on UPDATE of status).
-- Guarded by "hired_at IS NULL" so it is never overwritten once populated.
CREATE OR REPLACE FUNCTION set_pipeline_candidate_hired_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'hired' AND NEW.hired_at IS NULL THEN
    NEW.hired_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pipeline_candidate_hired_at ON pipeline_candidates;
CREATE TRIGGER trg_pipeline_candidate_hired_at
  BEFORE INSERT OR UPDATE OF status ON pipeline_candidates
  FOR EACH ROW
  EXECUTE FUNCTION set_pipeline_candidate_hired_at();

-- Backfill existing hires. pipeline_candidates has no updated_at column, so created_at is the
-- best-available proxy for historical hires; going forward the trigger records the exact time.
UPDATE pipeline_candidates
  SET hired_at = created_at
  WHERE status = 'hired' AND hired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_candidates_hired_at
  ON pipeline_candidates (hired_at)
  WHERE hired_at IS NOT NULL;
