-- Dual score (primary 20/80, shadow 40/60) and recruiter selection tracking.
-- Primary = signal×0.2 + grade×0.8; Shadow = signal×0.4 + grade×0.6.
-- overall_score = displayed score (primary or shadow per recruiter_selected).

ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS primary_score smallint
  CHECK (primary_score IS NULL OR (primary_score >= 0 AND primary_score <= 100));
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS shadow_score smallint
  CHECK (shadow_score IS NULL OR (shadow_score >= 0 AND shadow_score <= 100));
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS primary_blend jsonb;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS shadow_blend jsonb;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS recruiter_selected varchar(20);
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS recruiter_override smallint
  CHECK (recruiter_override IS NULL OR (recruiter_override >= 0 AND recruiter_override <= 100));

COMMENT ON COLUMN fit_scores.primary_score IS 'Primary blend (20/80) score; stored at write time for display when recruiter selects shadow.';
COMMENT ON COLUMN fit_scores.shadow_score IS 'Shadow blend: 40% signal + 60% grade (for recruiter comparison).';
COMMENT ON COLUMN fit_scores.primary_blend IS 'Primary blend breakdown: signal_weighted, grade_weighted, formula.';
COMMENT ON COLUMN fit_scores.shadow_blend IS 'Shadow blend breakdown: signal_weighted, grade_weighted, formula.';
COMMENT ON COLUMN fit_scores.recruiter_selected IS 'Recruiter choice: primary | shadow (for calibration analytics).';
COMMENT ON COLUMN fit_scores.recruiter_override IS 'Optional custom score entered by recruiter.';
