-- Add signal_score and grade_based_score to fit_scores for provenance and blend breakdown.
-- final score = signal_score × 0.2 + grade_based_score × 0.8 when signal layer runs.

ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS signal_score smallint CHECK (signal_score IS NULL OR (signal_score >= 0 AND signal_score <= 100));
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS grade_based_score smallint CHECK (grade_based_score IS NULL OR (grade_based_score >= 0 AND grade_based_score <= 100));

COMMENT ON COLUMN fit_scores.signal_score IS 'Signal-layer score (0–100): keyword overlap, ownership density, quantified outcomes, etc. Part of blend.';
COMMENT ON COLUMN fit_scores.grade_based_score IS 'Grade-based score (0–100) from rubric criteria. Part of blend.';
