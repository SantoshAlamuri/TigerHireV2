-- FitScore hybrid v2: JD Base Document per job + optional v2 columns on fit_scores

CREATE TABLE IF NOT EXISTS public.jd_base_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  role_title text NOT NULL,
  company text NOT NULL DEFAULT 'TigerHire Client',
  context text NOT NULL,
  weights jsonb NOT NULL,
  score_floor integer NOT NULL DEFAULT 15,
  fit_thresholds jsonb NOT NULL DEFAULT '{"strong": 78, "good": 60, "moderate": 40, "weak": 25}'::jsonb,
  extraction_additions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jd_base_documents_job_id_unique UNIQUE (job_id)
);

CREATE INDEX IF NOT EXISTS idx_jd_base_job ON public.jd_base_documents (job_id);

COMMENT ON TABLE public.jd_base_documents IS 'Hybrid FitScore v2: per-job extraction context, dimension weights, floors, and thresholds.';

ALTER TABLE public.fit_scores ADD COLUMN IF NOT EXISTS v2_extraction jsonb;
ALTER TABLE public.fit_scores ADD COLUMN IF NOT EXISTS v2_explanation text;
ALTER TABLE public.fit_scores ADD COLUMN IF NOT EXISTS v2_score_breakdown jsonb;
ALTER TABLE public.fit_scores ADD COLUMN IF NOT EXISTS scoring_version integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.fit_scores.v2_extraction IS 'Hybrid v2: structured CandidateExtraction JSON from Stage 2A.';
COMMENT ON COLUMN public.fit_scores.v2_explanation IS 'Hybrid v2: Stage 4 LLM explanation text.';
COMMENT ON COLUMN public.fit_scores.v2_score_breakdown IS 'Hybrid v2: deterministic ScoreBreakdown JSON.';
COMMENT ON COLUMN public.fit_scores.scoring_version IS '1 = legacy/three-stage; 2 = hybrid deterministic + v2 fields.';

CREATE INDEX IF NOT EXISTS idx_fit_scores_scoring_version ON public.fit_scores (scoring_version);

ALTER TABLE public.jd_base_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read jd_base for their jobs"
  ON public.jd_base_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = jd_base_documents.job_id
      AND jobs.organisation_id = ANY (public.auth_organisation_ids())
    )
  );

CREATE POLICY "Super admins can read all jd_base_documents"
  ON public.jd_base_documents FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- Writes via service role (API routes); no INSERT/UPDATE policies for authenticated users

INSERT INTO public.feature_flags (key, enabled, description)
VALUES (
  'fitscore_hybrid_v2',
  false,
  'Hybrid FitScore v2: JD Base + Haiku extraction + deterministic engine + explanation APIs'
)
ON CONFLICT (key) DO NOTHING;
