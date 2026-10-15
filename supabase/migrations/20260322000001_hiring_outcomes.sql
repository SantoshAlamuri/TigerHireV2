-- Hiring outcomes for FitScore v2.0 learning loop: terminal hired/rejected with score snapshot.
-- performance_rating, retained_6m, retained_12m are filled manually post-hire (not by pipeline).

CREATE TABLE IF NOT EXISTS public.hiring_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates (id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  outcome text NOT NULL CHECK (outcome IN ('hired', 'rejected')),
  fitscore smallint CHECK (fitscore IS NULL OR (fitscore >= 0 AND fitscore <= 100)),
  band text,
  extraction_model text,
  parse_quality_score double precision,
  low_fitscore_override boolean NOT NULL DEFAULT false,
  performance_rating smallint CHECK (
    performance_rating IS NULL OR (performance_rating >= 1 AND performance_rating <= 5)
  ),
  retained_6m boolean,
  retained_12m boolean,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid,
  CONSTRAINT hiring_outcomes_job_candidate_unique UNIQUE (job_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_hiring_outcomes_org_recorded
  ON public.hiring_outcomes (organisation_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_hiring_outcomes_job_id
  ON public.hiring_outcomes (job_id);

CREATE INDEX IF NOT EXISTS idx_hiring_outcomes_candidate_id
  ON public.hiring_outcomes (candidate_id);

CREATE INDEX IF NOT EXISTS idx_hiring_outcomes_outcome
  ON public.hiring_outcomes (outcome);

COMMENT ON TABLE public.hiring_outcomes IS 'Terminal hire/reject decisions with FitScore snapshot for model calibration; rejections are as important as hires for learning.';
COMMENT ON COLUMN public.hiring_outcomes.fitscore IS 'Displayed score at decision time (primary_score if set, else overall_score).';
COMMENT ON COLUMN public.hiring_outcomes.low_fitscore_override IS 'True when fitscore < 50 at decision time (human overrode low model score or rejected despite low score).';
COMMENT ON COLUMN public.hiring_outcomes.performance_rating IS 'Post-hire manual 1–5; not set by pipeline.';
COMMENT ON COLUMN public.hiring_outcomes.retained_6m IS 'Post-hire manual retention flag; not set by pipeline.';
COMMENT ON COLUMN public.hiring_outcomes.retained_12m IS 'Post-hire manual retention flag; not set by pipeline.';
COMMENT ON COLUMN public.hiring_outcomes.recorded_by IS 'Profile/user id of recruiter who recorded the outcome, when available.';

ALTER TABLE public.hiring_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read hiring outcomes for their jobs"
  ON public.hiring_outcomes FOR SELECT
  USING (
    public.auth_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = hiring_outcomes.job_id
        AND j.organisation_id = ANY (public.auth_organisation_ids())
    )
  );

CREATE POLICY "Org recruiters can insert hiring outcomes for their jobs"
  ON public.hiring_outcomes FOR INSERT
  WITH CHECK (
    public.auth_role() = 'super_admin'
    OR (
      public.auth_role() IN (
        'company_admin',
        'recruiter',
        'agency',
        'hiring_manager'
      )
      AND EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.id = hiring_outcomes.job_id
          AND j.organisation_id = ANY (public.auth_organisation_ids())
      )
      AND hiring_outcomes.organisation_id = (
        SELECT j2.organisation_id FROM public.jobs j2 WHERE j2.id = hiring_outcomes.job_id
      )
    )
  );

CREATE POLICY "Org recruiters can update hiring outcomes for their jobs"
  ON public.hiring_outcomes FOR UPDATE
  USING (
    public.auth_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = hiring_outcomes.job_id
        AND j.organisation_id = ANY (public.auth_organisation_ids())
    )
  )
  WITH CHECK (
    public.auth_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = hiring_outcomes.job_id
        AND j.organisation_id = ANY (public.auth_organisation_ids())
    )
  );
