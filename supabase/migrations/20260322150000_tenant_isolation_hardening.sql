-- Tenant isolation hardening:
-- 1) Tighten messaging insert policies to prevent arbitrary cross-tenant joins.
-- 2) Enable RLS + tenant policies on sensitive tables created without RLS.

-- ---------------------------------------------------------------------------
-- Messaging policies
-- ---------------------------------------------------------------------------

drop policy if exists "Authenticated users can create conversations" on public.conversations;
create policy "Authenticated users can create conversations"
  on public.conversations for insert
  with check (
    auth.uid() is not null
    and (
      organisation_id is null
      or public.auth_can_see_organisation(organisation_id)
      or public.auth_role() = 'super_admin'
    )
    and (
      job_id is null
      or exists (
        select 1
        from public.jobs j
        where j.id = conversations.job_id
          and (
            public.auth_can_see_organisation(j.organisation_id)
            or public.auth_role() = 'super_admin'
          )
      )
    )
    and (
      job_id is null
      or organisation_id is null
      or exists (
        select 1
        from public.jobs j
        where j.id = conversations.job_id
          and j.organisation_id = conversations.organisation_id
      )
    )
  );

drop policy if exists "Authenticated users can join conversations" on public.conversation_participants;
create policy "Authenticated users can join conversations"
  on public.conversation_participants for insert
  with check (
    (
      user_id = auth.uid()
      and exists (
        select 1
        from public.conversations c
        where c.id = conversation_participants.conversation_id
          and (
            c.organisation_id is null
            or public.auth_can_see_organisation(c.organisation_id)
            or public.auth_role() = 'super_admin'
          )
      )
    )
    or
    (
      exists (
        select 1
        from public.conversation_participants cp
        where cp.conversation_id = conversation_participants.conversation_id
          and cp.user_id = auth.uid()
      )
      and exists (
        select 1
        from public.conversations c
        where c.id = conversation_participants.conversation_id
          and (
            c.organisation_id is null
            or public.auth_can_see_organisation(c.organisation_id)
            or public.auth_role() = 'super_admin'
          )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- job_distributions RLS
-- ---------------------------------------------------------------------------

alter table public.job_distributions enable row level security;

drop policy if exists "job distributions org read" on public.job_distributions;
create policy "job distributions org read"
  on public.job_distributions for select
  using (
    exists (
      select 1
      from public.jobs j
      where j.id = job_distributions.job_id
        and (
          public.auth_can_see_organisation(j.organisation_id)
          or public.auth_role() = 'super_admin'
        )
    )
  );

drop policy if exists "job distributions org write" on public.job_distributions;
create policy "job distributions org write"
  on public.job_distributions for all
  using (
    exists (
      select 1
      from public.jobs j
      where j.id = job_distributions.job_id
        and (
          (
            public.auth_can_see_organisation(j.organisation_id)
            and public.auth_role() in ('company_admin', 'recruiter', 'agency')
          )
          or public.auth_role() = 'super_admin'
        )
    )
  )
  with check (
    exists (
      select 1
      from public.jobs j
      where j.id = job_distributions.job_id
        and (
          (
            public.auth_can_see_organisation(j.organisation_id)
            and public.auth_role() in ('company_admin', 'recruiter', 'agency')
          )
          or public.auth_role() = 'super_admin'
        )
    )
  );

-- ---------------------------------------------------------------------------
-- FitScore cache tables RLS
-- ---------------------------------------------------------------------------

alter table public.jd_intel_cache enable row level security;
alter table public.candidate_profile_cache enable row level security;

drop policy if exists "jd intel cache org read" on public.jd_intel_cache;
create policy "jd intel cache org read"
  on public.jd_intel_cache for select
  using (
    exists (
      select 1
      from public.jobs j
      where j.id = jd_intel_cache.job_id
        and (
          public.auth_can_see_organisation(j.organisation_id)
          or public.auth_role() = 'super_admin'
        )
    )
  );

drop policy if exists "jd intel cache org write" on public.jd_intel_cache;
create policy "jd intel cache org write"
  on public.jd_intel_cache for all
  using (
    exists (
      select 1
      from public.jobs j
      where j.id = jd_intel_cache.job_id
        and (
          (
            public.auth_can_see_organisation(j.organisation_id)
            and public.auth_role() in ('company_admin', 'recruiter', 'agency')
          )
          or public.auth_role() = 'super_admin'
        )
    )
  )
  with check (
    exists (
      select 1
      from public.jobs j
      where j.id = jd_intel_cache.job_id
        and (
          (
            public.auth_can_see_organisation(j.organisation_id)
            and public.auth_role() in ('company_admin', 'recruiter', 'agency')
          )
          or public.auth_role() = 'super_admin'
        )
    )
  );

-- Candidates are not keyed by organisation_id; tenant access is via unlocks / fit_scores / jobs (see can_org_access_candidate).
drop policy if exists "candidate profile cache org read" on public.candidate_profile_cache;
create policy "candidate profile cache org read"
  on public.candidate_profile_cache for select
  using (
    public.auth_role() = 'super_admin'
    or public.can_caller_orgs_access_candidate(candidate_profile_cache.candidate_id)
  );

drop policy if exists "candidate profile cache org write" on public.candidate_profile_cache;
create policy "candidate profile cache org write"
  on public.candidate_profile_cache for all
  using (
    public.auth_role() = 'super_admin'
    or (
      public.auth_role() in ('company_admin', 'recruiter', 'agency')
      and public.can_caller_orgs_access_candidate(candidate_profile_cache.candidate_id)
    )
  )
  with check (
    public.auth_role() = 'super_admin'
    or (
      public.auth_role() in ('company_admin', 'recruiter', 'agency')
      and public.can_caller_orgs_access_candidate(candidate_profile_cache.candidate_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Platform cost ledger RLS
-- ---------------------------------------------------------------------------

alter table public.platform_price_catalog enable row level security;
alter table public.platform_cost_events enable row level security;

drop policy if exists "platform price catalog super admin read" on public.platform_price_catalog;
create policy "platform price catalog super admin read"
  on public.platform_price_catalog for select
  using (public.auth_role() = 'super_admin');

drop policy if exists "platform price catalog super admin write" on public.platform_price_catalog;
create policy "platform price catalog super admin write"
  on public.platform_price_catalog for all
  using (public.auth_role() = 'super_admin')
  with check (public.auth_role() = 'super_admin');

drop policy if exists "platform cost events read" on public.platform_cost_events;
create policy "platform cost events read"
  on public.platform_cost_events for select
  using (
    public.auth_role() = 'super_admin'
    or (
      organisation_id is not null
      and public.auth_can_see_organisation(organisation_id)
      and public.auth_role() = 'company_admin'
    )
  );

drop policy if exists "platform cost events super admin write" on public.platform_cost_events;
create policy "platform cost events super admin write"
  on public.platform_cost_events for all
  using (public.auth_role() = 'super_admin')
  with check (public.auth_role() = 'super_admin');
