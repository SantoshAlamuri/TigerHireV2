-- FitScore Production v1: clear caches and ensure columns exist

-- Clear old data for fresh start
DELETE FROM fit_score_rubrics;
DELETE FROM fit_score_evidence;

-- Verify new columns exist on fit_scores
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fit_scores' AND column_name = 'band') THEN
    ALTER TABLE fit_scores ADD COLUMN band VARCHAR(20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fit_scores' AND column_name = 'confidence') THEN
    ALTER TABLE fit_scores ADD COLUMN confidence VARCHAR(10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fit_scores' AND column_name = 'criteria_breakdown') THEN
    ALTER TABLE fit_scores ADD COLUMN criteria_breakdown JSONB DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fit_scores' AND column_name = 'provenance_hash') THEN
    ALTER TABLE fit_scores ADD COLUMN provenance_hash VARCHAR(64);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fit_scores' AND column_name = 'scoring_formula') THEN
    ALTER TABLE fit_scores ADD COLUMN scoring_formula TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fit_scores' AND column_name = 'rubric_snapshot') THEN
    ALTER TABLE fit_scores ADD COLUMN rubric_snapshot JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fit_scores' AND column_name = 'evidence_snapshot') THEN
    ALTER TABLE fit_scores ADD COLUMN evidence_snapshot JSONB;
  END IF;
END $$;
