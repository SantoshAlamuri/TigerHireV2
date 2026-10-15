-- Extend hiring_outcomes to capture recruiter FitScore accuracy feedback.
-- Keeps existing outcome rows while enabling per-fit_score per-user feedback signals.

ALTER TABLE public.hiring_outcomes
  ADD COLUMN IF NOT EXISTS fit_score_id uuid REFERENCES public.fit_scores (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fit_score_value smallint CHECK (
    fit_score_value IS NULL OR (fit_score_value >= 0 AND fit_score_value <= 100)
  ),
  ADD COLUMN IF NOT EXISTS scoring_version integer,
  ADD COLUMN IF NOT EXISTS accuracy_signal text CHECK (
    accuracy_signal IN ('accurate', 'too_low', 'too_high')
  ),
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Existing rows can use the legacy fitscore field as fit_score_value when missing.
UPDATE public.hiring_outcomes
SET fit_score_value = fitscore
WHERE fit_score_value IS NULL
  AND fitscore IS NOT NULL;

-- Outcome is now nullable until hiring decision is finalized.
ALTER TABLE public.hiring_outcomes
  ALTER COLUMN outcome DROP NOT NULL;

ALTER TABLE public.hiring_outcomes
  DROP CONSTRAINT IF EXISTS hiring_outcomes_outcome_check;

ALTER TABLE public.hiring_outcomes
  ADD CONSTRAINT hiring_outcomes_outcome_check CHECK (
    outcome IS NULL OR outcome IN ('hired', 'rejected', 'withdrawn')
  );

-- Remove one-row-per-job-candidate restriction; feedback may have multiple rows over time.
ALTER TABLE public.hiring_outcomes
  DROP CONSTRAINT IF EXISTS hiring_outcomes_job_candidate_unique;

-- One feedback submission per fit_score row per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hiring_outcomes_feedback_once_per_user
  ON public.hiring_outcomes (fit_score_id, submitted_by)
  WHERE fit_score_id IS NOT NULL
    AND submitted_by IS NOT NULL
    AND accuracy_signal IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hiring_outcomes_accuracy_signal
  ON public.hiring_outcomes (accuracy_signal);

CREATE INDEX IF NOT EXISTS idx_hiring_outcomes_scoring_version
  ON public.hiring_outcomes (scoring_version);

COMMENT ON COLUMN public.hiring_outcomes.fit_score_id IS
  'Fit score row used when recruiter provided feedback.';
COMMENT ON COLUMN public.hiring_outcomes.fit_score_value IS
  'Score snapshot captured at feedback/decision time.';
COMMENT ON COLUMN public.hiring_outcomes.scoring_version IS
  '1 = three-stage, 2 = hybrid v2.';
COMMENT ON COLUMN public.hiring_outcomes.accuracy_signal IS
  'Recruiter judgment of score quality: accurate, too_low, too_high.';
COMMENT ON COLUMN public.hiring_outcomes.note IS
  'Optional short recruiter comment for why score was/was not accurate.';
COMMENT ON COLUMN public.hiring_outcomes.submitted_by IS
  'User who submitted feedback for this fit_score.';
