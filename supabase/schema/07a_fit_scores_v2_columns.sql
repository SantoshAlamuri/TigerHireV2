-- Run on existing DBs that already have fit_scores without v2 columns.
-- New installs use 07_fit_scores.sql which includes these columns.

ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS red_flags text[];
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS interview_angles text[];
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS ai_recommendation text;
