create table if not exists public.assessment_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  type text not null check (type in ('written', 'take_home', 'mcq', 'coding', 'psychometric')),
  scope text not null check (scope in ('screening', 'shortlist', 'final')),
  name text not null,
  content text not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assessment_templates_org_type_scope
  on public.assessment_templates(organisation_id, type, scope, is_active);

alter table public.assessment_templates enable row level security;

drop policy if exists "assessment templates org read" on public.assessment_templates;
create policy "assessment templates org read"
  on public.assessment_templates for select
  using (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in ('company_admin', 'recruiter', 'hiring_manager', 'super_admin')
  );

drop policy if exists "assessment templates org write" on public.assessment_templates;
create policy "assessment templates org write"
  on public.assessment_templates for all
  using (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in ('company_admin', 'recruiter', 'hiring_manager', 'super_admin')
  )
  with check (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in ('company_admin', 'recruiter', 'hiring_manager', 'super_admin')
  );

drop trigger if exists assessment_templates_updated_at on public.assessment_templates;
create trigger assessment_templates_updated_at
  before update on public.assessment_templates
  for each row execute function public.set_updated_at();
