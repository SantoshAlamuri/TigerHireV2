-- Organisation runtime feature flag overrides:
-- - global defaults remain in feature_flags
-- - per-org runtime overrides live in organisation_runtime_feature_flag_overrides

create table if not exists organisation_runtime_feature_flag_overrides (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  flag_key text not null references feature_flags(key) on delete cascade,
  enabled boolean not null,
  reason text null,
  updated_by uuid null references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, flag_key)
);

create index if not exists org_runtime_flag_overrides_org_idx
  on organisation_runtime_feature_flag_overrides (organisation_id);

create index if not exists org_runtime_flag_overrides_org_flag_idx
  on organisation_runtime_feature_flag_overrides (organisation_id, flag_key);

create index if not exists org_runtime_flag_overrides_flag_idx
  on organisation_runtime_feature_flag_overrides (flag_key);

alter table organisation_runtime_feature_flag_overrides enable row level security;

drop policy if exists org_runtime_flag_overrides_super_admin_read on organisation_runtime_feature_flag_overrides;
create policy org_runtime_flag_overrides_super_admin_read
  on organisation_runtime_feature_flag_overrides
  for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

drop policy if exists org_runtime_flag_overrides_super_admin_write on organisation_runtime_feature_flag_overrides;
create policy org_runtime_flag_overrides_super_admin_write
  on organisation_runtime_feature_flag_overrides
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
