-- A1: Time-in-stage (dwell / TAT) analytics — append-only transition log + dwell aggregates.

BEGIN;

CREATE TABLE public.pipeline_stage_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates (id) ON DELETE CASCADE,
  pipeline_candidate_id uuid NOT NULL REFERENCES public.pipeline_candidates (id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  moved_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  entered_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pipeline_stage_transitions_job_candidate
  ON public.pipeline_stage_transitions (job_id, candidate_id);

CREATE INDEX idx_pipeline_stage_transitions_pc
  ON public.pipeline_stage_transitions (pipeline_candidate_id);

CREATE INDEX idx_pipeline_stage_transitions_entered_at
  ON public.pipeline_stage_transitions (entered_at DESC);

COMMENT ON TABLE public.pipeline_stage_transitions IS
  'Append-only log of pipeline stage moves for dwell/TAT analytics (A1).';

ALTER TABLE public.pipeline_stage_transitions ENABLE ROW LEVEL SECURITY;

-- SELECT: mirror pipeline_candidates (candidates own job rows, org members, HM, agency clients, super_admin)
CREATE POLICY pipeline_stage_transitions_select ON public.pipeline_stage_transitions
  FOR SELECT USING (
    (EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.id = pipeline_stage_transitions.candidate_id
        AND c.user_id = auth.uid()
    ))
    OR (EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = pipeline_stage_transitions.job_id
        AND j.organisation_id = (SELECT public.auth_organisation_id())
    ))
    OR (EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = pipeline_stage_transitions.job_id
        AND j.hiring_manager_id = auth.uid()
    ))
    OR ((SELECT public.auth_role()) = 'super_admin')
    OR (
      (SELECT public.auth_role()) = 'agency'
      AND EXISTS (
        SELECT 1 FROM public.jobs j
        JOIN public.agency_clients ac ON ac.client_organisation_id = j.organisation_id
        WHERE j.id = pipeline_stage_transitions.job_id
          AND ac.agency_organisation_id = (SELECT public.auth_organisation_id())
      )
    )
  );

-- INSERT: org recruiters / agency on linked client jobs (same shape as pipeline_candidates_insert)
CREATE POLICY pipeline_stage_transitions_insert ON public.pipeline_stage_transitions
  FOR INSERT WITH CHECK (
    (
      (EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.id = pipeline_stage_transitions.job_id
          AND j.organisation_id = (SELECT public.auth_organisation_id())
      ))
      AND ((SELECT public.auth_role()) = ANY (
        ARRAY['company_admin'::public.app_role, 'recruiter'::public.app_role, 'agency'::public.app_role]
      ))
    )
    OR (
      (SELECT public.auth_role()) = 'agency'
      AND EXISTS (
        SELECT 1 FROM public.jobs j
        JOIN public.agency_clients ac ON ac.client_organisation_id = j.organisation_id
        WHERE j.id = pipeline_stage_transitions.job_id
          AND ac.agency_organisation_id = (SELECT public.auth_organisation_id())
      )
    )
    OR (
      (SELECT public.auth_role()) = 'hiring_manager'
      AND EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.id = pipeline_stage_transitions.job_id
          AND j.hiring_manager_id = auth.uid()
      )
    )
    OR ((SELECT public.auth_role()) = 'super_admin')
  );

-- Per-row completed dwell samples (exit = next transition on same pipeline_candidate_id)
CREATE OR REPLACE VIEW public.pipeline_stage_dwell_samples AS
WITH ordered AS (
  SELECT
    id,
    job_id,
    candidate_id,
    pipeline_candidate_id,
    to_stage,
    entered_at,
    LEAD(entered_at) OVER (
      PARTITION BY pipeline_candidate_id
      ORDER BY entered_at ASC
    ) AS exited_at
  FROM public.pipeline_stage_transitions
)
SELECT
  o.job_id,
  j.organisation_id,
  j.title AS job_title,
  o.to_stage,
  o.candidate_id,
  o.pipeline_candidate_id,
  o.entered_at,
  o.exited_at,
  ROUND(
    (EXTRACT(EPOCH FROM (o.exited_at - o.entered_at)) / 86400.0)::numeric,
    4
  ) AS dwell_days
FROM ordered o
JOIN public.jobs j ON j.id = o.job_id
WHERE o.exited_at IS NOT NULL;

COMMENT ON VIEW public.pipeline_stage_dwell_samples IS
  'Completed dwell rows: time in to_stage until the next transition (A1).';

-- Aggregate dwell stats per job + stage (all time; API may filter via samples in app when dates are set)
CREATE OR REPLACE VIEW public.pipeline_stage_dwell AS
SELECT
  job_id,
  to_stage,
  COUNT(*)::bigint AS sample_size,
  COUNT(DISTINCT candidate_id)::bigint AS candidate_count,
  ROUND(AVG(dwell_days)::numeric, 2) AS avg_days,
  ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dwell_days))::numeric, 2) AS median_days,
  ROUND((PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY dwell_days))::numeric, 2) AS p90_days
FROM public.pipeline_stage_dwell_samples
GROUP BY job_id, to_stage;

COMMENT ON VIEW public.pipeline_stage_dwell IS
  'Median/p90/avg days spent per job and stage (completed dwell only; A1).';

GRANT SELECT ON public.pipeline_stage_dwell_samples TO authenticated;
GRANT SELECT ON public.pipeline_stage_dwell TO authenticated;

-- ---------------------------------------------------------------------------
-- One-time backfill: seed initial transition (from_stage NULL) for existing
-- pipeline rows that have no log yet, so dwell math has a starting point.
-- ---------------------------------------------------------------------------
INSERT INTO public.pipeline_stage_transitions (
  job_id,
  candidate_id,
  pipeline_candidate_id,
  from_stage,
  to_stage,
  moved_by,
  entered_at
)
SELECT
  pc.job_id,
  pc.candidate_id,
  pc.id,
  NULL,
  COALESCE(ps.stage_name, '(no stage)'),
  NULL,
  COALESCE(pc.created_at, now())
FROM public.pipeline_candidates pc
LEFT JOIN public.pipeline_stages ps
  ON ps.id = pc.stage_id
  AND ps.job_id = pc.job_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.pipeline_stage_transitions t
  WHERE t.pipeline_candidate_id = pc.id
);

COMMIT;
