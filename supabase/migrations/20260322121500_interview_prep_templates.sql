create table if not exists public.interview_prep_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  role_function text,
  stage_name text,
  title text not null,
  when_to_use text not null,
  objective text not null,
  question_tracks jsonb not null default '[]'::jsonb,
  rubric jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_prep_templates_question_tracks_array check (jsonb_typeof(question_tracks) = 'array'),
  constraint interview_prep_templates_rubric_array check (jsonb_typeof(rubric) = 'array')
);

create index if not exists idx_interview_prep_templates_org_scope
  on public.interview_prep_templates(organisation_id, is_active, role_function, stage_name);

alter table public.interview_prep_templates enable row level security;

drop policy if exists "interview prep templates org read" on public.interview_prep_templates;
create policy "interview prep templates org read"
  on public.interview_prep_templates for select
  using (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in ('company_admin', 'recruiter', 'hiring_manager', 'interviewer', 'super_admin')
  );

drop policy if exists "interview prep templates org write" on public.interview_prep_templates;
create policy "interview prep templates org write"
  on public.interview_prep_templates for all
  using (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in ('company_admin', 'recruiter', 'hiring_manager', 'super_admin')
  )
  with check (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in ('company_admin', 'recruiter', 'hiring_manager', 'super_admin')
  );

drop trigger if exists interview_prep_templates_updated_at on public.interview_prep_templates;
create trigger interview_prep_templates_updated_at
  before update on public.interview_prep_templates
  for each row execute function public.set_updated_at();
