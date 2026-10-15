-- Brief 12: org-level default recruitment plan stages for new jobs
alter table if exists public.organisations
  add column if not exists default_recruitment_plan_stages jsonb;

comment on column public.organisations.default_recruitment_plan_stages is
  'Optional JSON array of default plan stage templates; new recruitment plans inherit when no pipeline_stages exist.';
