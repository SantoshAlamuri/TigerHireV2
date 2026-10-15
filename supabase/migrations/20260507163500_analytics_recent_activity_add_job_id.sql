-- Ensure analytics_recent_activity exposes job_id expected by API/export consumers.
CREATE OR REPLACE VIEW public.analytics_recent_activity AS
SELECT
  j.organisation_id,
  'application'::text AS event_type,
  a.id AS event_id,
  a.status::text AS event_detail,
  j.title AS job_title,
  a.created_at AS event_at,
  a.job_id
FROM public.applications a
JOIN public.jobs j ON j.id = a.job_id
WHERE a.created_at > now() - interval '30 days'
UNION ALL
SELECT
  j.organisation_id,
  'pipeline_move'::text AS event_type,
  pc.id AS event_id,
  pc.status::text AS event_detail,
  j.title AS job_title,
  pc.created_at AS event_at,
  pc.job_id
FROM public.pipeline_candidates pc
JOIN public.jobs j ON j.id = pc.job_id
WHERE pc.created_at > now() - interval '30 days'
ORDER BY event_at DESC;
