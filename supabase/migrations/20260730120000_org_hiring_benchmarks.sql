-- Let an organisation set its own hiring targets.
--
-- Analytics currently compares every figure against published industry
-- benchmarks (SHRM / LinkedIn, India cuts where they differ). Those are a
-- reasonable default and a poor permanent answer: a startup hiring in 20 days
-- does not want to be congratulated for beating a 45-day median, and an
-- enterprise with a 60-day approval chain does not want to be permanently red.
--
-- One row per organisation per metric. The published figure remains the fallback
-- when no row exists, and the UI always says which of the two it is showing —
-- presenting a customer's internal goal as an industry median would be worse
-- than showing neither.

create table if not exists public.org_hiring_benchmarks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  -- Matches the keys in src/lib/v2/benchmarks.ts (timeToFill, offerAcceptance, …).
  metric_key text not null,
  target_value numeric not null check (target_value > 0),
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_hiring_benchmarks_unique unique (organisation_id, metric_key)
);

comment on table public.org_hiring_benchmarks is
  'Per-org hiring targets that override the published benchmarks in analytics. Absence of a row means the published industry figure is used.';

create index if not exists org_hiring_benchmarks_org_idx
  on public.org_hiring_benchmarks (organisation_id);

alter table public.org_hiring_benchmarks enable row level security;

-- Read: anyone in the organisation. Targets are not sensitive, and every seat
-- sees the benchmark line on the metric tiles.
drop policy if exists org_hiring_benchmarks_select on public.org_hiring_benchmarks;
create policy org_hiring_benchmarks_select
  on public.org_hiring_benchmarks
  for select
  to authenticated
  using (
    organisation_id in (
      select p.organisation_id from public.profiles p where p.id = (select auth.uid())
    )
  );

-- Write: only the roles that own hiring policy. A target silently changed by a
-- hiring manager would repaint every leadership dashboard.
drop policy if exists org_hiring_benchmarks_write on public.org_hiring_benchmarks;
create policy org_hiring_benchmarks_write
  on public.org_hiring_benchmarks
  for all
  to authenticated
  using (
    organisation_id in (
      select p.organisation_id
        from public.profiles p
       where p.id = (select auth.uid())
         and p.role in ('super_admin', 'leadership', 'recruiter')
    )
  )
  with check (
    organisation_id in (
      select p.organisation_id
        from public.profiles p
       where p.id = (select auth.uid())
         and p.role in ('super_admin', 'leadership', 'recruiter')
    )
  );
