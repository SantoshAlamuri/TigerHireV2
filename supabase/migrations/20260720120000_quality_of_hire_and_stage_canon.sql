-- Reporting layer: (1) canonicalize pipeline stage matching so the funnel stays accurate when
-- orgs use custom stage names, and (2) add Quality-of-Hire views over data already captured in
-- hiring_outcomes + post_hire_pulse_responses (previously stored but never surfaced in any report).

BEGIN;

-- ---------------------------------------------------------------------------
-- (1) Canonical stage rank. Maps a free-text pipeline stage name to a monotonic
-- ordinal so "reached interviewed" is true whenever the candidate reached interview
-- OR any later stage (offer/hire) — and so custom names without the literal words
-- "screen"/"interview"/"offer" still classify correctly.
--   0 = terminal-negative (reject/withdraw), 1 = applied, 2 = screened,
--   3 = shortlisted, 4 = interviewed, 5 = offered, 6 = hired
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.canonical_stage_rank(raw text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN raw IS NULL THEN 1
    WHEN lower(raw) ~ '(reject|declin|withdraw|dropped|not[ _]?select)' THEN 0
    WHEN lower(raw) ~ '(hire|hired|joined|onboard|placed|closed[ _]?won)' THEN 6
    WHEN lower(raw) ~ '(offer|proposal|negotiat|comp[ _]?discuss)' THEN 5
    WHEN lower(raw) ~ '(interview|round|onsite|on-site|panel|technical|tech[ _]?screen|assessment|aptitude|evaluation|coding|take[ _]?home|\ml[1-5]\M|\mf2f\M)' THEN 4
    WHEN lower(raw) ~ '(shortlist|short[ _]?list|selected|advance|move[ _]?forward|progress)' THEN 3
    WHEN lower(raw) ~ '(screen|pre[ _]?screen|recruiter[ _]?call|phone[ _]?screen|qualif|hr[ _]?round)' THEN 2
    ELSE 1
  END;
$$;

COMMENT ON FUNCTION public.canonical_stage_rank(text) IS
  'Maps a free-text pipeline stage name to a monotonic rank (0 reject/withdraw .. 6 hired). Used by application_funnel so the funnel is accurate under custom stage names. Extend the keyword patterns as new stage vocabularies appear.';

-- Rewrite the funnel to use max-rank progression instead of independent ILIKE flags.
-- Output columns are unchanged so the analytics API/UI need no changes.
CREATE OR REPLACE VIEW public.application_funnel AS
WITH ranks AS (
  SELECT
    a.id AS application_id,
    a.job_id,
    a.candidate_id,
    a.status::text AS status,
    j.organisation_id,
    j.title AS job_title,
    GREATEST(
      COALESCE((
        SELECT MAX(public.canonical_stage_rank(t.to_stage))
        FROM public.pipeline_stage_transitions t
        WHERE t.job_id = a.job_id AND t.candidate_id = a.candidate_id
      ), 1),
      CASE WHEN a.status::text = 'hired' THEN 6 ELSE 1 END
    ) AS max_rank
  FROM public.applications a
  INNER JOIN public.jobs j ON j.id = a.job_id
)
SELECT
  job_id,
  organisation_id,
  MAX(job_title) AS job_title,
  COUNT(*) FILTER (WHERE status <> 'withdrawn')::bigint AS applied_count,
  COUNT(*) FILTER (WHERE status <> 'withdrawn' AND max_rank >= 2)::bigint AS screened_count,
  COUNT(*) FILTER (WHERE status <> 'withdrawn' AND max_rank >= 3)::bigint AS shortlisted_count,
  COUNT(*) FILTER (WHERE status <> 'withdrawn' AND max_rank >= 4)::bigint AS interviewed_count,
  COUNT(*) FILTER (WHERE status <> 'withdrawn' AND max_rank >= 5)::bigint AS offered_count,
  COUNT(*) FILTER (WHERE status = 'hired')::bigint AS hired_count,
  COUNT(*) FILTER (WHERE status = 'withdrawn')::bigint AS withdrawn_count,
  COUNT(*) FILTER (WHERE status = 'rejected')::bigint AS rejected_count,
  (COUNT(*) FILTER (WHERE status = 'hired')::numeric
    / NULLIF(COUNT(*) FILTER (WHERE status <> 'withdrawn'), 0)::numeric) AS conversion_rate
FROM ranks
GROUP BY job_id, organisation_id;

COMMENT ON VIEW public.application_funnel IS
  'Per-job application funnel from applications + pipeline_stage_transitions, using canonical_stage_rank so metrics stay accurate under custom stage names (reaching a later stage implies all earlier ones).';

-- ---------------------------------------------------------------------------
-- (2) Quality-of-Hire views. security_invoker so a direct user query is RLS-scoped;
-- the analytics API reads them via the admin client and filters by organisation_id
-- (same pattern as the other analytics endpoints).
-- ---------------------------------------------------------------------------

-- 2a. Quality of hire per job, from the manually-maintained hiring_outcomes loop.
CREATE OR REPLACE VIEW public.quality_of_hire_by_job
WITH (security_invoker = true) AS
SELECT
  ho.organisation_id,
  ho.job_id,
  j.title AS job_title,
  COUNT(*)::bigint AS hires_count,
  AVG(ho.performance_rating) FILTER (WHERE ho.performance_rating IS NOT NULL) AS avg_performance_rating,
  COUNT(*) FILTER (WHERE ho.performance_rating IS NOT NULL)::bigint AS rated_count,
  COUNT(*) FILTER (WHERE ho.retained_6m IS TRUE)::bigint AS retained_6m_count,
  COUNT(*) FILTER (WHERE ho.retained_6m IS NOT NULL)::bigint AS retention_6m_known,
  COUNT(*) FILTER (WHERE ho.retained_12m IS TRUE)::bigint AS retained_12m_count,
  COUNT(*) FILTER (WHERE ho.retained_12m IS NOT NULL)::bigint AS retention_12m_known,
  AVG(ho.fitscore) FILTER (WHERE ho.fitscore IS NOT NULL) AS avg_hire_fitscore
FROM public.hiring_outcomes ho
INNER JOIN public.jobs j ON j.id = ho.job_id
WHERE ho.outcome = 'hired'
GROUP BY ho.organisation_id, ho.job_id, j.title;

COMMENT ON VIEW public.quality_of_hire_by_job IS
  'Per-job Quality of Hire from hiring_outcomes: avg 1-5 performance rating, 6m/12m retention, avg hire FitScore. Denominators (rated_count, retention_*_known) are exposed so the UI can show coverage.';

-- 2b. Post-hire pulse rollup per job (latest milestone response per candidate).
CREATE OR REPLACE VIEW public.post_hire_pulse_by_job
WITH (security_invoker = true) AS
WITH latest AS (
  SELECT DISTINCT ON (r.job_id, r.candidate_id)
    r.job_id,
    r.candidate_id,
    r.response,
    r.responded_at
  FROM public.post_hire_pulse_responses r
  ORDER BY r.job_id, r.candidate_id, r.check_in_day DESC
)
SELECT
  j.organisation_id,
  l.job_id,
  j.title AS job_title,
  COUNT(*)::bigint AS pulses_tracked,
  COUNT(*) FILTER (WHERE l.responded_at IS NOT NULL)::bigint AS pulses_responded,
  COUNT(*) FILTER (WHERE l.response = 'left')::bigint AS left_count,
  AVG(CASE l.response
        WHEN 'excellent' THEN 5 WHEN 'good' THEN 4 WHEN 'average' THEN 3
        WHEN 'poor' THEN 2 WHEN 'left' THEN 1 END) AS avg_pulse_score
FROM latest l
INNER JOIN public.jobs j ON j.id = l.job_id
GROUP BY j.organisation_id, l.job_id, j.title;

COMMENT ON VIEW public.post_hire_pulse_by_job IS
  'Per-job 30/60/90-day post-hire pulse rollup (latest milestone per candidate): response rate, early-attrition (left) count, and avg pulse score (excellent=5 .. left=1).';

-- 2c. FitScore predictive validity: does a higher FitScore actually predict a better hire?
CREATE OR REPLACE VIEW public.fitscore_predictive_validity
WITH (security_invoker = true) AS
SELECT
  ho.organisation_id,
  CASE
    WHEN ho.fitscore >= 80 THEN '80-100'
    WHEN ho.fitscore >= 70 THEN '70-79'
    WHEN ho.fitscore >= 50 THEN '50-69'
    ELSE '0-49'
  END AS fitscore_band,
  COUNT(*)::bigint AS hires,
  AVG(ho.performance_rating) AS avg_performance_rating,
  (COUNT(*) FILTER (WHERE ho.retained_6m IS TRUE)::numeric
    / NULLIF(COUNT(*) FILTER (WHERE ho.retained_6m IS NOT NULL), 0)::numeric) AS retention_6m_rate
FROM public.hiring_outcomes ho
WHERE ho.outcome = 'hired'
  AND ho.fitscore IS NOT NULL
  AND ho.performance_rating IS NOT NULL
GROUP BY ho.organisation_id, fitscore_band;

COMMENT ON VIEW public.fitscore_predictive_validity IS
  'Predicted-vs-actual: hires bucketed by FitScore band with the average post-hire performance rating and 6m retention per band. Demonstrates whether the score predicts hire quality.';

COMMIT;
