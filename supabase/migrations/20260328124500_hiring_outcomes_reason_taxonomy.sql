-- India-SMB reason taxonomy for recruiter FitScore feedback.

ALTER TABLE public.hiring_outcomes
  ADD COLUMN IF NOT EXISTS feedback_reason text CHECK (
    feedback_reason IS NULL OR feedback_reason IN (
      'skill_gap',
      'experience_level_mismatch',
      'location_constraint',
      'salary_expectation_mismatch',
      'domain_mismatch',
      'cultural_fit_concern',
      'role_filled_internally'
    )
  );

CREATE INDEX IF NOT EXISTS idx_hiring_outcomes_feedback_reason
  ON public.hiring_outcomes (feedback_reason);

COMMENT ON COLUMN public.hiring_outcomes.feedback_reason IS
  'Optional recruiter-selected reason taxonomy for score calibration in India SMB hiring context.';
