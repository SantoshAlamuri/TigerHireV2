create table if not exists public.pending_jd_approval (
  job_id uuid not null references public.jobs(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  enqueued_at timestamptz not null default timezone('utc', now()),
  attempted_at timestamptz null,
  last_error text null,
  primary key (job_id, candidate_id)
);

create index if not exists idx_pending_jd_approval_job_id
  on public.pending_jd_approval (job_id);

create index if not exists idx_pending_jd_approval_enqueued_at
  on public.pending_jd_approval (enqueued_at desc);
