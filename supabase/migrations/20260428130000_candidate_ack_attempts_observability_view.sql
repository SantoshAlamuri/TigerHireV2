create or replace view public.candidate_acknowledgement_attempts_daily as
select
  date_trunc('day', created_at) as day_bucket,
  event_type,
  ingestion_path,
  channel,
  outcome,
  coalesce(reason_code, 'none') as reason_code,
  count(*)::bigint as attempts
from public.candidate_acknowledgement_attempts
group by 1, 2, 3, 4, 5, 6;

comment on view public.candidate_acknowledgement_attempts_daily is
  'Daily acknowledgement attempt outcomes by event/path/channel for rollout monitoring dashboards.';

