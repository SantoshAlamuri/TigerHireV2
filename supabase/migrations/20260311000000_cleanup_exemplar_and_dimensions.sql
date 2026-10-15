-- Remove all experimental columns added for exemplar testing
ALTER TABLE fit_scores DROP COLUMN IF EXISTS exemplar_score;
ALTER TABLE fit_scores DROP COLUMN IF EXISTS exemplar_variance;
ALTER TABLE fit_scores DROP COLUMN IF EXISTS legacy_score;

-- Remove dimension columns if they exist (we'll add clean ones)
ALTER TABLE fit_scores DROP COLUMN IF EXISTS universal_score;
ALTER TABLE fit_scores DROP COLUMN IF EXISTS universal_dimensions;
ALTER TABLE fit_scores DROP COLUMN IF EXISTS universal_reasoning;

-- Clean up cached data from old prompts
DELETE FROM fit_score_evidence WHERE created_at < '2026-03-11';
-- Clear rubrics whose stored prompt_version (in JSON) is not dimensions-v1.0
DELETE FROM fit_score_rubrics
WHERE COALESCE(role_intelligence->>'prompt_version', '') != 'dimensions-v1.0';
