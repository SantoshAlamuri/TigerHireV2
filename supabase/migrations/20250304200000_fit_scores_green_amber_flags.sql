-- Add green_flags and amber_flags to fit_scores so the UI can show strengths and concerns alongside red flags.
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS green_flags text[];
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS amber_flags text[];
COMMENT ON COLUMN fit_scores.green_flags IS 'Strengths / positive signals from FitScore (e.g. strong skill match, location fit).';
COMMENT ON COLUMN fit_scores.amber_flags IS 'Minor concerns from FitScore (e.g. career gap, salary at upper end of budget).';
