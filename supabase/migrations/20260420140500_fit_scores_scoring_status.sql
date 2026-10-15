-- Add scoring status to support deferred retries during Anthropic outages.

ALTER TABLE public.fit_scores
  ADD COLUMN IF NOT EXISTS scoring_status text NOT NULL DEFAULT 'scored';

ALTER TABLE public.fit_scores
  ADD COLUMN IF NOT EXISTS scoring_status_reason text;

ALTER TABLE public.fit_scores
  ADD COLUMN IF NOT EXISTS scoring_status_updated_at timestamptz
  NOT NULL DEFAULT timezone('utc', now());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fit_scores_scoring_status_check'
  ) THEN
    ALTER TABLE public.fit_scores
      ADD CONSTRAINT fit_scores_scoring_status_check
      CHECK (scoring_status IN ('scored', 'deferred', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fit_scores_scoring_status
  ON public.fit_scores (scoring_status);

CREATE INDEX IF NOT EXISTS idx_fit_scores_scoring_status_updated_at
  ON public.fit_scores (scoring_status_updated_at DESC);
