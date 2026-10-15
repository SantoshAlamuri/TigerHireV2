-- Add override_reason to pipeline_candidates for capturing recruiter feedback
-- when they move candidates against FitScore direction.

ALTER TABLE pipeline_candidates
  ADD COLUMN IF NOT EXISTS override_reason text,
  ADD COLUMN IF NOT EXISTS override_reason_text text;

COMMENT ON COLUMN pipeline_candidates.override_reason IS 'Predefined reason code when recruiter overrides FitScore recommendation (e.g., "strong_interview", "cultural_fit", "referral")';
COMMENT ON COLUMN pipeline_candidates.override_reason_text IS 'Optional free-text explanation for the override';
