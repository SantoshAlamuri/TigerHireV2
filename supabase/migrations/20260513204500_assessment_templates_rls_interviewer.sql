-- Allow interviewer role (with app-level template permission) to read/write assessment templates
-- consistently with POST/PATCH/DELETE on /api/assessment-templates.

drop policy if exists "assessment templates org read" on public.assessment_templates;

create policy "assessment templates org read"
  on public.assessment_templates for select
  using (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in (
      'company_admin',
      'recruiter',
      'hiring_manager',
      'interviewer',
      'super_admin'
    )
  );

drop policy if exists "assessment templates org write" on public.assessment_templates;

create policy "assessment templates org write"
  on public.assessment_templates for all
  using (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in (
      'company_admin',
      'recruiter',
      'hiring_manager',
      'interviewer',
      'super_admin'
    )
  )
  with check (
    organisation_id = public.auth_organisation_id()
    and public.auth_role() in (
      'company_admin',
      'recruiter',
      'hiring_manager',
      'interviewer',
      'super_admin'
    )
  );
