-- Per-job and per-candidate attribution on platform_cost_events so the Super
-- Admin dashboard can answer "how much did job X cost us?" and "what is the
-- average AI spend per candidate?". Both columns are NULLABLE so existing
-- rows (and rows from providers without job context like Vercel/Stripe) keep
-- working. Indexes target the dominant query: top jobs by spend in a window.

ALTER TABLE public.platform_cost_events
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS candidate_id uuid REFERENCES public.candidates (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_platform_cost_events_job
  ON public.platform_cost_events (job_id, occurred_at DESC)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_cost_events_candidate
  ON public.platform_cost_events (candidate_id, occurred_at DESC)
  WHERE candidate_id IS NOT NULL;

COMMENT ON COLUMN public.platform_cost_events.job_id IS
  'Job this spend is attributable to (NULL for org/infrastructure-level rows).';
COMMENT ON COLUMN public.platform_cost_events.candidate_id IS
  'Candidate this spend is attributable to (NULL when not candidate-specific).';
