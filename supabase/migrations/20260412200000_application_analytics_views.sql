-- A4: Application funnel + source summary analytics (read-only views; no new tables).
-- Stage matching uses intentional fuzzy ILIKE patterns — tune once real production stage names are known.

BEGIN;

CREATE OR REPLACE VIEW public.application_funnel AS
WITH base AS (
  SELECT
    a.id AS application_id,
    a.job_id,
    a.candidate_id,
    a.status::text AS status,
    a.created_at,
    j.organisation_id,
    j.title AS job_title,
    EXISTS (
      SELECT 1
      FROM public.pipeline_stage_transitions t
      WHERE t.job_id = a.job_id
        AND t.candidate_id = a.candidate_id
        AND t.to_stage ILIKE '%screen%'
    ) AS reached_screened,
    EXISTS (
      SELECT 1
      FROM public.pipeline_stage_transitions t
      WHERE t.job_id = a.job_id
        AND t.candidate_id = a.candidate_id
        AND t.to_stage ILIKE '%shortlist%'
    ) AS reached_shortlisted,
    EXISTS (
      SELECT 1
      FROM public.pipeline_stage_transitions t
      WHERE t.job_id = a.job_id
        AND t.candidate_id = a.candidate_id
        AND t.to_stage ILIKE '%interview%'
    ) AS reached_interviewed,
    EXISTS (
      SELECT 1
      FROM public.pipeline_stage_transitions t
      WHERE t.job_id = a.job_id
        AND t.candidate_id = a.candidate_id
        AND t.to_stage ILIKE '%offer%'
    ) AS reached_offered
  FROM public.applications a
  INNER JOIN public.jobs j ON j.id = a.job_id
)
SELECT
  job_id,
  organisation_id,
  MAX(job_title) AS job_title,
  COUNT(*) FILTER (WHERE status <> 'withdrawn')::bigint AS applied_count,
  COUNT(*) FILTER (WHERE status <> 'withdrawn' AND reached_screened)::bigint AS screened_count,
  COUNT(*) FILTER (WHERE status <> 'withdrawn' AND reached_shortlisted)::bigint AS shortlisted_count,
  COUNT(*) FILTER (WHERE status <> 'withdrawn' AND reached_interviewed)::bigint AS interviewed_count,
  COUNT(*) FILTER (WHERE status <> 'withdrawn' AND reached_offered)::bigint AS offered_count,
  COUNT(*) FILTER (WHERE status = 'hired')::bigint AS hired_count,
  COUNT(*) FILTER (WHERE status = 'withdrawn')::bigint AS withdrawn_count,
  COUNT(*) FILTER (WHERE status = 'rejected')::bigint AS rejected_count,
  (COUNT(*) FILTER (WHERE status = 'hired')::numeric
    / NULLIF(COUNT(*) FILTER (WHERE status <> 'withdrawn'), 0)::numeric) AS conversion_rate
FROM base
GROUP BY job_id, organisation_id;

COMMENT ON VIEW public.application_funnel IS
  'Per-job application funnel counts from applications + pipeline_stage_transitions (A4). '
  'ILIKE patterns are deliberately loose for custom stage names — adjust in migration if metrics look wrong.';

CREATE OR REPLACE VIEW public.application_source_summary AS
SELECT
  a.job_id,
  j.organisation_id,
  j.title AS job_title,
  COALESCE(NULLIF(btrim(a.source::text), ''), 'unknown') AS source,
  COUNT(*)::bigint AS count,
  COUNT(*) FILTER (WHERE a.status = 'hired')::bigint AS hired_count,
  (COUNT(*) FILTER (WHERE a.status = 'hired')::numeric
    / NULLIF(COUNT(*)::numeric, 0)) AS conversion_rate
FROM public.applications a
JOIN public.jobs j ON j.id = a.job_id
GROUP BY a.job_id, j.organisation_id, j.title, COALESCE(NULLIF(btrim(a.source::text), ''), 'unknown');

COMMENT ON VIEW public.application_source_summary IS
  'Applications and hires grouped by job and applications.source (A4).';

GRANT SELECT ON public.application_funnel TO authenticated;
GRANT SELECT ON public.application_source_summary TO authenticated;

COMMIT;
