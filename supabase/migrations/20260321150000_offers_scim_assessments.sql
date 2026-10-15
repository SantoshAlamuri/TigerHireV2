-- P0/P1 remaining build foundation:
-- - enterprise roles + SCIM mappings
-- - offers + finance approvals
-- - assessments lifecycle + scoring

do $$
begin
  alter type app_role add value if not exists 'finance';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter type app_role add value if not exists 'interviewer';
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists azure_oid text,
  add column if not exists is_active boolean not null default true;

create unique index if not exists idx_profiles_azure_oid on public.profiles(azure_oid) where azure_oid is not null;
create index if not exists idx_profiles_is_active on public.profiles(is_active);

create table if not exists public.employee_roles (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in (
    'recruiter',
    'interviewer',
    'hiring_manager',
    'finance',
    'company_admin',
    'agency',
    'employee'
  )),
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id, role)
);

alter table public.employee_roles enable row level security;

drop policy if exists "employee roles org read" on public.employee_roles;
create policy "employee roles org read"
  on public.employee_roles for select
  using (
    exists (
      select 1
      from public.profiles p_self
      join public.profiles p_target on p_target.id = employee_roles.employee_id
      where p_self.id = auth.uid()
        and p_self.organisation_id is not null
        and p_self.organisation_id = p_target.organisation_id
    )
  );

drop policy if exists "employee roles org admin manage" on public.employee_roles;
create policy "employee roles org admin manage"
  on public.employee_roles for all
  using (
    exists (
      select 1
      from public.profiles p_self
      join public.profiles p_target on p_target.id = employee_roles.employee_id
      where p_self.id = auth.uid()
        and p_self.role in ('company_admin', 'super_admin')
        and (
          p_self.role = 'super_admin'
          or p_self.organisation_id = p_target.organisation_id
        )
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p_self
      join public.profiles p_target on p_target.id = employee_roles.employee_id
      where p_self.id = auth.uid()
        and p_self.role in ('company_admin', 'super_admin')
        and (
          p_self.role = 'super_admin'
          or p_self.organisation_id = p_target.organisation_id
        )
    )
  );

drop trigger if exists employee_roles_updated_at on public.employee_roles;
create trigger employee_roles_updated_at
  before update on public.employee_roles
  for each row execute function public.set_updated_at();

create table if not exists public.azure_group_role_mappings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  azure_group_id text not null,
  tigerhire_role text not null check (tigerhire_role in (
    'recruiter',
    'interviewer',
    'hiring_manager',
    'finance',
    'company_admin',
    'agency',
    'employee'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organisation_id, azure_group_id, tigerhire_role)
);

alter table public.azure_group_role_mappings enable row level security;

drop policy if exists "azure mapping org admin manage" on public.azure_group_role_mappings;
create policy "azure mapping org admin manage"
  on public.azure_group_role_mappings for all
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

drop trigger if exists azure_group_role_mappings_updated_at on public.azure_group_role_mappings;
create trigger azure_group_role_mappings_updated_at
  before update on public.azure_group_role_mappings
  for each row execute function public.set_updated_at();

create table if not exists public.scim_provisioning_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete set null,
  external_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.scim_provisioning_events enable row level security;

drop policy if exists "scim events org admin read" on public.scim_provisioning_events;
create policy "scim events org admin read"
  on public.scim_provisioning_events for select
  using (
    (
      organisation_id = public.auth_organisation_id()
      and public.auth_role() in ('company_admin', 'super_admin')
    )
    or public.auth_role() = 'super_admin'
  );

create index if not exists idx_scim_events_org_created on public.scim_provisioning_events(organisation_id, created_at desc);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  role_title text not null,
  start_date date not null,
  status text not null default 'draft' check (status in (
    'draft',
    'pending_finance',
    'approved',
    'rejected',
    'sent',
    'accepted',
    'declined',
    'expired'
  )),
  compensation_json jsonb not null default '{}'::jsonb,
  notes text,
  sent_at timestamptz,
  responded_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_offers_org_status on public.offers(organisation_id, status);
create unique index if not exists idx_offers_application_active on public.offers(application_id)
  where status in ('draft', 'pending_finance', 'approved', 'sent');

alter table public.offers enable row level security;

drop policy if exists "offers org read" on public.offers;
create policy "offers org read"
  on public.offers for select
  using (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in ('company_admin', 'recruiter', 'hiring_manager', 'super_admin')
  );

drop policy if exists "offers org create" on public.offers;
create policy "offers org create"
  on public.offers for insert
  with check (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in ('company_admin', 'recruiter', 'hiring_manager', 'super_admin')
  );

drop policy if exists "offers org update" on public.offers;
create policy "offers org update"
  on public.offers for update
  using (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in ('company_admin', 'recruiter', 'hiring_manager', 'super_admin')
  )
  with check (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in ('company_admin', 'recruiter', 'hiring_manager', 'super_admin')
  );

drop trigger if exists offers_updated_at on public.offers;
create trigger offers_updated_at
  before update on public.offers
  for each row execute function public.set_updated_at();

create table if not exists public.offer_approvals (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  approver_id uuid not null references public.profiles(id) on delete restrict,
  decision text not null check (decision in ('approved', 'rejected')),
  comment text,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_offer_approvals_offer on public.offer_approvals(offer_id, decided_at desc);

alter table public.offer_approvals enable row level security;

drop policy if exists "offer approvals org read" on public.offer_approvals;
create policy "offer approvals org read"
  on public.offer_approvals for select
  using (
    exists (
      select 1 from public.offers o
      where o.id = offer_approvals.offer_id
        and o.organisation_id = public.auth_organisation_id()
    )
  );

drop policy if exists "offer approvals org create" on public.offer_approvals;
create policy "offer approvals org create"
  on public.offer_approvals for insert
  with check (
    exists (
      select 1 from public.offers o
      where o.id = offer_approvals.offer_id
        and o.organisation_id = public.auth_organisation_id()
    )
  );

create table if not exists public.offer_candidate_responses (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null unique references public.offers(id) on delete cascade,
  response text not null check (response in ('accept', 'decline', 'counter')),
  comment text,
  responded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.offer_candidate_responses enable row level security;

drop policy if exists "offer responses org read" on public.offer_candidate_responses;
create policy "offer responses org read"
  on public.offer_candidate_responses for select
  using (
    exists (
      select 1 from public.offers o
      where o.id = offer_candidate_responses.offer_id
        and o.organisation_id = public.auth_organisation_id()
    )
  );

drop policy if exists "offer responses org create" on public.offer_candidate_responses;
create policy "offer responses org create"
  on public.offer_candidate_responses for insert
  with check (
    exists (
      select 1 from public.offers o
      where o.id = offer_candidate_responses.offer_id
        and o.organisation_id = public.auth_organisation_id()
    )
  );

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  stage_id uuid references public.pipeline_stages(id) on delete set null,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  type text not null check (type in ('written', 'take_home', 'mcq', 'coding')),
  status text not null default 'pending' check (status in ('pending', 'submitted', 'scored', 'expired')),
  title text not null,
  instructions text,
  deadline_at timestamptz not null,
  reviewer_id uuid references public.profiles(id) on delete set null,
  pass_threshold_pct integer,
  auto_advance boolean not null default false,
  external_platform text,
  webhook_url text,
  submission_text text,
  submission_url text,
  score numeric(5,2),
  max_score numeric(5,2),
  feedback text,
  submitted_at timestamptz,
  scored_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assessments_org_status on public.assessments(organisation_id, status, deadline_at);
create index if not exists idx_assessments_application on public.assessments(application_id, created_at desc);

alter table public.assessments enable row level security;

drop policy if exists "assessments org read" on public.assessments;
create policy "assessments org read"
  on public.assessments for select
  using (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in ('company_admin', 'recruiter', 'hiring_manager', 'super_admin')
  );

drop policy if exists "assessments org write" on public.assessments;
create policy "assessments org write"
  on public.assessments for all
  using (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in ('company_admin', 'recruiter', 'hiring_manager', 'super_admin')
  )
  with check (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in ('company_admin', 'recruiter', 'hiring_manager', 'super_admin')
  );

drop trigger if exists assessments_updated_at on public.assessments;
create trigger assessments_updated_at
  before update on public.assessments
  for each row execute function public.set_updated_at();
