-- High-frequency recruiter action signals for FitScore calibration.
-- Captures shortlist/reject/stage moves with fit score snapshots.

CREATE TABLE IF NOT EXISTS public.pipeline_action_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates (id) ON DELETE CASCADE,
  pipeline_candidate_id uuid REFERENCES public.pipeline_candidates (id) ON DELETE SET NULL,
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('shortlist', 'reject', 'move_stage', 'move_to_interview')),
  stage_id uuid REFERENCES public.pipeline_stages (id) ON DELETE SET NULL,
  stage_name text,
  fit_score_id uuid REFERENCES public.fit_scores (id) ON DELETE SET NULL,
  fit_score_value smallint CHECK (fit_score_value IS NULL OR (fit_score_value >= 0 AND fit_score_value <= 100)),
  scoring_version integer,
  submitted_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pas_org_created_at
  ON public.pipeline_action_signals (organisation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pas_job_created_at
  ON public.pipeline_action_signals (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pas_candidate_created_at
  ON public.pipeline_action_signals (candidate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pas_action
  ON public.pipeline_action_signals (action);

CREATE INDEX IF NOT EXISTS idx_pas_fit_score_id
  ON public.pipeline_action_signals (fit_score_id);

COMMENT ON TABLE public.pipeline_action_signals IS
  'High-frequency recruiter action telemetry for FitScore calibration (shortlist/reject/stage moves).';
COMMENT ON COLUMN public.pipeline_action_signals.fit_score_value IS
  'Score snapshot at action time (primary_score if present else overall_score).';
COMMENT ON COLUMN public.pipeline_action_signals.metadata IS
  'Optional route/action context for auditing and model analysis.';

ALTER TABLE public.pipeline_action_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read pipeline action signals for their jobs"
  ON public.pipeline_action_signals FOR SELECT
  USING (
    public.auth_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = pipeline_action_signals.job_id
        AND j.organisation_id = ANY (public.auth_organisation_ids())
    )
  );

CREATE POLICY "Org recruiters can insert pipeline action signals for their jobs"
  ON public.pipeline_action_signals FOR INSERT
  WITH CHECK (
    public.auth_role() = 'super_admin'
    OR (
      public.auth_role() IN ('company_admin', 'recruiter', 'agency', 'hiring_manager')
      AND EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.id = pipeline_action_signals.job_id
          AND j.organisation_id = ANY (public.auth_organisation_ids())
      )
      AND pipeline_action_signals.organisation_id = (
        SELECT j2.organisation_id FROM public.jobs j2 WHERE j2.id = pipeline_action_signals.job_id
      )
    )
  );
