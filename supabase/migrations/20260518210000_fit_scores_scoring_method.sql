-- How a fit_scores row was produced (hybrid merged, deterministic fallback, etc.).

ALTER TABLE public.fit_scores
  ADD COLUMN IF NOT EXISTS scoring_method text;

COMMENT ON COLUMN public.fit_scores.scoring_method IS
  'Scoring path: hybrid_merged, hybrid, deterministic_fallback, etc.';

CREATE INDEX IF NOT EXISTS idx_fit_scores_scoring_method_created
  ON public.fit_scores (scoring_method, created_at DESC)
  WHERE scoring_method IS NOT NULL;
