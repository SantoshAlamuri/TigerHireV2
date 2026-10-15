# Candidate Acknowledgement Observability Queries

Use these queries during rollout ramps to watch send/suppression/failure behavior.

## 1) Attempts by outcome (last 24h)

```sql
select
  channel,
  outcome,
  count(*) as attempts
from candidate_acknowledgement_attempts
where created_at >= now() - interval '24 hours'
group by channel, outcome
order by channel, outcome;
```

## 2) Suppressions by reason (last 24h)

```sql
select
  channel,
  reason_code,
  count(*) as attempts
from candidate_acknowledgement_attempts
where created_at >= now() - interval '24 hours'
  and outcome like 'suppressed_%'
group by channel, reason_code
order by channel, attempts desc;
```

## 3) Daily trend by path/channel/outcome

```sql
select
  day_bucket::date as day,
  ingestion_path,
  channel,
  outcome,
  sum(attempts) as attempts
from candidate_acknowledgement_attempts_daily
group by day, ingestion_path, channel, outcome
order by day desc, ingestion_path, channel, outcome;
```

## 4) North-star SLO: attempts within 60s

```sql
with ingests as (
  select
    application_id,
    min(created_at) as first_attempt_at
  from candidate_acknowledgement_attempts
  where event_type = 'cv_ingested'
  group by application_id
),
apps as (
  select id, created_at
  from applications
  where created_at >= now() - interval '24 hours'
)
select
  count(*) filter (
    where i.first_attempt_at is not null
      and i.first_attempt_at <= a.created_at + interval '60 seconds'
  )::numeric / nullif(count(*), 0) as ack_attempt_within_60s_rate
from apps a
left join ingests i on i.application_id = a.id;
```

## Backlog Note

- Add a read policy for `candidate_acknowledgement_attempts` rows where `job_id is null`, scoped by candidate organisation linkage, so org-scoped dashboards can inspect bulk/email-intake suppressions without widening access.
