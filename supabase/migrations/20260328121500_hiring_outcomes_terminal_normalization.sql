-- Terminal outcome normalization:
-- - enforce one row per (job_id, candidate_id)
-- - add source/source_event_id audit fields
-- - provide conflict-safe upsert function preserving existing feedback signals

ALTER TABLE public.hiring_outcomes
  ADD COLUMN IF NOT EXISTS source text CHECK (
    source IS NULL OR source IN ('application_service', 'feedback_hire_api', 'manual')
  ),
  ADD COLUMN IF NOT EXISTS source_event_id text;

UPDATE public.hiring_outcomes
SET source = COALESCE(source, 'manual')
WHERE source IS NULL;

-- Keep latest row per (job_id, candidate_id) before reintroducing unique constraint.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY job_id, candidate_id
      ORDER BY COALESCE(recorded_at, created_at, now()) DESC, id DESC
    ) AS rn
  FROM public.hiring_outcomes
)
DELETE FROM public.hiring_outcomes h
USING ranked r
WHERE h.id = r.id
  AND r.rn > 1;

ALTER TABLE public.hiring_outcomes
  DROP CONSTRAINT IF EXISTS hiring_outcomes_job_candidate_unique;

ALTER TABLE public.hiring_outcomes
  ADD CONSTRAINT hiring_outcomes_job_candidate_unique UNIQUE (job_id, candidate_id);

DROP INDEX IF EXISTS public.idx_hiring_outcomes_feedback_once_per_user;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hiring_outcomes_source_event
  ON public.hiring_outcomes (source, source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.upsert_hiring_outcome_signal(
  p_job_id uuid,
  p_candidate_id uuid,
  p_organisation_id uuid,
  p_outcome text,
  p_fit_score_id uuid,
  p_fit_score_value smallint,
  p_scoring_version integer,
  p_fitscore smallint,
  p_band text,
  p_extraction_model text,
  p_parse_quality_score double precision,
  p_low_fitscore_override boolean,
  p_recorded_by uuid,
  p_recorded_at timestamptz,
  p_source text,
  p_source_event_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.hiring_outcomes (
    job_id,
    candidate_id,
    organisation_id,
    outcome,
    fit_score_id,
    fit_score_value,
    scoring_version,
    fitscore,
    band,
    extraction_model,
    parse_quality_score,
    low_fitscore_override,
    recorded_by,
    recorded_at,
    source,
    source_event_id
  )
  VALUES (
    p_job_id,
    p_candidate_id,
    p_organisation_id,
    p_outcome,
    p_fit_score_id,
    p_fit_score_value,
    p_scoring_version,
    p_fitscore,
    p_band,
    p_extraction_model,
    p_parse_quality_score,
    COALESCE(p_low_fitscore_override, false),
    p_recorded_by,
    COALESCE(p_recorded_at, now()),
    p_source,
    p_source_event_id
  )
  ON CONFLICT (job_id, candidate_id)
  DO UPDATE SET
    outcome = EXCLUDED.outcome,
    fit_score_id = COALESCE(public.hiring_outcomes.fit_score_id, EXCLUDED.fit_score_id),
    fit_score_value = COALESCE(public.hiring_outcomes.fit_score_value, EXCLUDED.fit_score_value),
    scoring_version = COALESCE(public.hiring_outcomes.scoring_version, EXCLUDED.scoring_version),
    fitscore = COALESCE(public.hiring_outcomes.fitscore, EXCLUDED.fitscore),
    band = COALESCE(public.hiring_outcomes.band, EXCLUDED.band),
    extraction_model = COALESCE(public.hiring_outcomes.extraction_model, EXCLUDED.extraction_model),
    parse_quality_score = COALESCE(public.hiring_outcomes.parse_quality_score, EXCLUDED.parse_quality_score),
    low_fitscore_override = COALESCE(public.hiring_outcomes.low_fitscore_override, false)
      OR COALESCE(EXCLUDED.low_fitscore_override, false),
    recorded_by = EXCLUDED.recorded_by,
    recorded_at = EXCLUDED.recorded_at,
    source = EXCLUDED.source,
    source_event_id = COALESCE(EXCLUDED.source_event_id, public.hiring_outcomes.source_event_id),
    organisation_id = EXCLUDED.organisation_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_hiring_outcome_signal IS
  'Conflict-safe terminal outcome upsert preserving existing recruiter feedback fields.';
