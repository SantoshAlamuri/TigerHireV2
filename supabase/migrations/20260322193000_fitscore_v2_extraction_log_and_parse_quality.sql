-- FitScore v2.0: extraction audit log + parse quality / extraction model on fit_scores

CREATE TABLE IF NOT EXISTS public.fitscore_extraction_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id text NOT NULL,
  job_id text NOT NULL,
  event_type text NOT NULL,
  parse_quality_score double precision,
  extraction_model text,
  extraction_fallback boolean DEFAULT false,
  has_experience boolean,
  has_tools boolean,
  has_evidence boolean,
  failure_reason text,
  failure_detail text,
  resume_format text,
  resume_pages integer,
  has_tables boolean,
  has_columns boolean,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fitscore_extraction_log_job_created
  ON public.fitscore_extraction_log (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fitscore_extraction_log_candidate_created
  ON public.fitscore_extraction_log (candidate_id, created_at DESC);

COMMENT ON TABLE public.fitscore_extraction_log IS 'FitScore v2.0: per-event extraction audit (success, fallback, errors). Inserted by service-role scoring pipeline only.';

ALTER TABLE public.fit_scores
  ADD COLUMN IF NOT EXISTS parse_quality_score double precision;

ALTER TABLE public.fit_scores
  ADD COLUMN IF NOT EXISTS extraction_model text;

ALTER TABLE public.fit_scores
  ADD COLUMN IF NOT EXISTS extraction_fallback boolean DEFAULT false;

COMMENT ON COLUMN public.fit_scores.parse_quality_score IS 'v2.0: 0–1 parse quality after Stage 0 (text/vision).';
COMMENT ON COLUMN public.fit_scores.extraction_model IS 'v2.0: haiku | sonnet (Stage 2A model that produced CVFacts).';
COMMENT ON COLUMN public.fit_scores.extraction_fallback IS 'v2.0: true if Tier 2 (Sonnet) ran due to parse quality or critical field coverage.';

ALTER TABLE public.fitscore_extraction_log ENABLE ROW LEVEL SECURITY;

-- jobs.id is uuid; log.job_id is text (app passes string ids)
CREATE POLICY "Org members can read fitscore extraction log for their jobs"
  ON public.fitscore_extraction_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = fitscore_extraction_log.job_id::uuid
        AND j.organisation_id = ANY (public.auth_organisation_ids())
    )
  );

-- No INSERT/UPDATE/DELETE for authenticated users — service role bypasses RLS
