CREATE TABLE IF NOT EXISTS public.fit_scores_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  score integer NOT NULL,
  confidence text NOT NULL,
  confidence_lower integer NOT NULL,
  confidence_upper integer NOT NULL,
  node_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt_version text,
  scoring_version integer NOT NULL DEFAULT 1,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fit_scores_v2_job_candidate
  ON public.fit_scores_v2 (job_id, candidate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fit_scores_v2_is_primary
  ON public.fit_scores_v2 (is_primary, created_at DESC);

INSERT INTO public.feature_flags (key, enabled, description)
VALUES
  (
    'scoring_v2_shadow_enabled',
    false,
    'Run FitScore V2 in shadow mode and persist to fit_scores_v2 while V1 remains primary'
  ),
  (
    'scoring_v2_primary',
    false,
    'Promote FitScore V2 to primary serving path while retaining V1 as safety shadow'
  )
ON CONFLICT (key) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  description = EXCLUDED.description,
  updated_at = now();
