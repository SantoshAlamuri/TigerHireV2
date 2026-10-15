-- Reconciler: ensure organisation_runtime_feature_flag_overrides exists on every env.
--
-- Why this file exists (ledger-drift fix, see docs/ops/cascade-migration-ledger-note.md):
--   The canonical migration 20260426184000_org_runtime_feature_flag_overrides.sql created
--   this table. Its application history diverged across environments:
--     * prod    -> applied out-of-band; recorded under version 20260427160958
--                  (NOT 20260426184000), so the repo version string is missing from prod's ledger.
--     * staging -> never recorded at all, yet staging already has *newer* migrations applied
--                  (June cascade). Because `supabase db push` only applies migrations newer than
--                  the latest applied, the April migration is never back-filled on staging, so the
--                  table is simply absent there.
--
-- A forward, fully idempotent "ensure" migration is the clean convergence: it CREATEs the table
-- on staging (where it is missing) and is a harmless no-op on prod (where it already exists).
-- Apply via the normal repo/PR/CI flow only -- never via the Supabase MCP apply_migration tool
-- (that is what caused the original drift).
--
-- This intentionally mirrors 20260426184000 exactly. The original remains the canonical creator;
-- this file only reconciles environments that skipped it.

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
