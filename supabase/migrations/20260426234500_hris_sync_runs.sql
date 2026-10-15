-- HRIS sync orchestration runs (phase 1): records dry-run/live executions.

create table if not exists public.hris_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  provider text not null,
  mode text not null check (mode in ('dry_run', 'live')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'cancelled')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  triggered_by uuid references auth.users(id) on delete set null,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hris_sync_runs_org_created
  on public.hris_sync_runs (organisation_id, created_at desc);

create index if not exists idx_hris_sync_runs_org_provider_created
  on public.hris_sync_runs (organisation_id, provider, created_at desc);

alter table public.hris_sync_runs enable row level security;

drop policy if exists "hris sync runs select" on public.hris_sync_runs;
create policy "hris sync runs select"
  on public.hris_sync_runs for select
  using (
    (
      organisation_id = public.auth_organisation_id()
      and public.auth_role() in ('company_admin', 'recruiter', 'super_admin')
    )
    or public.auth_role() = 'super_admin'
  );

drop policy if exists "hris sync runs write" on public.hris_sync_runs;
create policy "hris sync runs write"
  on public.hris_sync_runs for all
  using (
    (
      organisation_id = public.auth_organisation_id()
      and public.auth_role() in ('company_admin', 'super_admin')
    )
    or public.auth_role() = 'super_admin'
  )
  with check (
    (
      organisation_id = public.auth_organisation_id()
      and public.auth_role() in ('company_admin', 'super_admin')
    )
    or public.auth_role() = 'super_admin'
  );

drop trigger if exists hris_sync_runs_updated_at on public.hris_sync_runs;
create trigger hris_sync_runs_updated_at
  before update on public.hris_sync_runs
  for each row execute function public.set_updated_at();

comment on table public.hris_sync_runs is
  'Execution history for HRIS sync orchestration runs (dry_run and live modes).';
