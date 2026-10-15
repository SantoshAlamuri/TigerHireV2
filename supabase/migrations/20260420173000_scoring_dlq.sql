create table if not exists public.scoring_dlq (
  id bigserial primary key,
  job_id uuid not null,
  candidate_id uuid not null,
  organisation_id uuid null,
  route text not null,
  error_message text not null,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  processed_at timestamptz null
);

create index if not exists idx_scoring_dlq_created_at on public.scoring_dlq (created_at desc);
create index if not exists idx_scoring_dlq_job_candidate on public.scoring_dlq (job_id, candidate_id);
