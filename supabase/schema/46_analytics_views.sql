-- Analytics materialized views for recruiter dashboards.
-- These provide pre-computed metrics for time-to-hire, pipeline conversion,
-- candidates by source, and recent activity.

BEGIN;

-- View: Time-to-hire by job (days from application to hired status)
CREATE OR REPLACE VIEW analytics_time_to_hire AS
SELECT
  a.job_id,
  j.title AS job_title,
  j.organisation_id,
  COUNT(*) AS hired_count,
  ROUND(AVG(EXTRACT(EPOCH FROM (a.updated_at - a.created_at)) / 86400)::numeric, 1) AS avg_days_to_hire,
  ROUND(MIN(EXTRACT(EPOCH FROM (a.updated_at - a.created_at)) / 86400)::numeric, 1) AS min_days,
  ROUND(MAX(EXTRACT(EPOCH FROM (a.updated_at - a.created_at)) / 86400)::numeric, 1) AS max_days
FROM applications a
JOIN jobs j ON j.id = a.job_id
WHERE a.status = 'hired'
GROUP BY a.job_id, j.title, j.organisation_id;

-- View: Pipeline conversion funnel per job
CREATE OR REPLACE VIEW analytics_pipeline_conversion AS
SELECT
  a.job_id,
  j.title AS job_title,
  j.organisation_id,
  COUNT(*) AS total_applications,
  COUNT(*) FILTER (WHERE a.status IN ('viewed', 'shortlisted', 'hired')) AS viewed,
  COUNT(*) FILTER (WHERE a.status IN ('shortlisted', 'hired')) AS shortlisted,
  COUNT(*) FILTER (WHERE a.status = 'hired') AS hired,
  COUNT(*) FILTER (WHERE a.status = 'rejected') AS rejected,
  COUNT(*) FILTER (WHERE a.status = 'withdrawn') AS withdrawn,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE a.status = 'hired') / NULLIF(COUNT(*), 0), 1
  ) AS hire_rate_pct
FROM applications a
JOIN jobs j ON j.id = a.job_id
GROUP BY a.job_id, j.title, j.organisation_id;

-- View: Candidates by source (signal_sources array)
CREATE OR REPLACE VIEW analytics_candidates_by_source AS
SELECT
  j.organisation_id,
  src AS source,
  COUNT(DISTINCT c.id) AS candidate_count
FROM candidates c
CROSS JOIN LATERAL unnest(c.signal_sources) AS src
JOIN applications a ON a.candidate_id = c.id
JOIN jobs j ON j.id = a.job_id
GROUP BY j.organisation_id, src;

-- View: Recent activity feed per organisation
CREATE OR REPLACE VIEW analytics_recent_activity AS
SELECT
  j.organisation_id,
  'application' AS event_type,
  a.id AS event_id,
  a.status::text AS event_detail,
  j.title AS job_title,
  a.created_at AS event_at,
  a.job_id
FROM applications a
JOIN jobs j ON j.id = a.job_id
WHERE a.created_at > now() - interval '30 days'
UNION ALL
SELECT
  j.organisation_id,
  'pipeline_move' AS event_type,
  pc.id AS event_id,
  pc.status::text AS event_detail,
  j.title AS job_title,
  pc.created_at AS event_at,
  pc.job_id
FROM pipeline_candidates pc
JOIN jobs j ON j.id = pc.job_id
WHERE pc.created_at > now() - interval '30 days'
ORDER BY event_at DESC;

ALTER VIEW analytics_recent_activity
  SET (security_invoker = true);

COMMENT ON VIEW analytics_time_to_hire IS 'Average time-to-hire per job for analytics dashboard';
COMMENT ON VIEW analytics_pipeline_conversion IS 'Pipeline conversion funnel metrics per job';
COMMENT ON VIEW analytics_candidates_by_source IS 'Candidate count grouped by signal source per org';
COMMENT ON VIEW analytics_recent_activity IS 'Last 30 days of activity across applications and pipeline for the org';

COMMIT;
