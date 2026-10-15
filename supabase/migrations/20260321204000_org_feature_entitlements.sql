-- Organisation feature entitlements:
-- - plan defaults live in billing_plans.limits.features
-- - per-org overrides live in organisation_feature_overrides
-- - global feature_flags remain kill switches

create table if not exists organisation_feature_overrides (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null,
  reason text null,
  updated_by uuid null references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, feature_key)
);

create index if not exists organisation_feature_overrides_org_idx
  on organisation_feature_overrides (organisation_id);

create index if not exists organisation_feature_overrides_feature_idx
  on organisation_feature_overrides (feature_key);

alter table organisation_feature_overrides enable row level security;

drop policy if exists organisation_feature_overrides_super_admin_read on organisation_feature_overrides;
create policy organisation_feature_overrides_super_admin_read
  on organisation_feature_overrides
  for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

drop policy if exists organisation_feature_overrides_super_admin_write on organisation_feature_overrides;
create policy organisation_feature_overrides_super_admin_write
  on organisation_feature_overrides
  for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

-- Backfill plan-level feature defaults (safe defaults = enabled to avoid regressions).
update billing_plans
set limits = jsonb_set(
  coalesce(limits, '{}'::jsonb),
  '{features}',
  coalesce(limits -> 'features', '{}'::jsonb) || '{
    "agents_run": true,
    "fitscore_batch": true,
    "assessments": true,
    "offers": true,
    "interview_prep": true,
    "scim": true
  }'::jsonb,
  true
)
where plan_type = 'company';
