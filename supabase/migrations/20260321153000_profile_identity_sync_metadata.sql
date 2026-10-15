-- Hybrid identity provisioning metadata for manual/CSV/Azure flows.
alter table if exists public.profiles
  add column if not exists identity_source text not null default 'manual',
  add column if not exists external_identity_id text,
  add column if not exists identity_last_synced_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_identity_source_check'
  ) then
    alter table public.profiles
      add constraint profiles_identity_source_check
      check (identity_source in ('manual', 'csv', 'azure'));
  end if;
end $$;

create index if not exists profiles_external_identity_id_idx
  on public.profiles (external_identity_id)
  where external_identity_id is not null;
