-- Add key_strengths, key_gaps, one_line_summary to fit_scores for three-stage FitScore persistence.
-- Required by src/lib/fitscore/three-stage/supabase-adapter.ts upsert.

ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS key_strengths text[];
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS key_gaps text[];
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS one_line_summary text;

COMMENT ON COLUMN fit_scores.key_strengths IS 'Three-stage: strengths / positive signals from criteria breakdown';
COMMENT ON COLUMN fit_scores.key_gaps IS 'Three-stage: gaps / concerns from criteria breakdown';
COMMENT ON COLUMN fit_scores.one_line_summary IS 'Single-line summary for recruiter';
