-- Settings: integrations, privacy settings, and audit log
-- Uses existing TigerHire naming conventions (organisation_id, roles in profiles).

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  provider text not null,
  -- auth_type values: 'api_key' | 'oauth'
  auth_type text not null default 'api_key',
  -- status values: 'connected' | 'disconnected' | 'error'
  status text not null default 'disconnected',
  status_message text,
  -- OAuth provider fields (stored encrypted from API layer)
  oauth_access_token text,
  oauth_refresh_token text,
  oauth_token_expires_at timestamptz,
  oauth_scopes text[],
  oauth_account_email text,
  -- API-key providers store a secret reference (never raw key)
  secret_ref text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organisation_id, provider)
);

alter table public.integrations enable row level security;

drop policy if exists "org can read integrations" on public.integrations;
create policy "org can read integrations"
  on public.integrations for select
  using (
    organisation_id = public.auth_organisation_id()
    or public.auth_role() = 'super_admin'
  );

drop policy if exists "org admins can manage integrations" on public.integrations;
create policy "org admins can manage integrations"
  on public.integrations for all
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

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  actor_email text,
  event_type text not null,
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

drop policy if exists "org admins can read audit log" on public.audit_log;
create policy "org admins can read audit log"
  on public.audit_log for select
  using (
    (
      organisation_id = public.auth_organisation_id()
      and public.auth_role() in ('company_admin', 'super_admin')
    )
    or public.auth_role() = 'super_admin'
  );

drop policy if exists "org admins can write audit log" on public.audit_log;
create policy "org admins can write audit log"
  on public.audit_log for insert
  with check (
    (
      organisation_id = public.auth_organisation_id()
      and public.auth_role() in ('company_admin', 'super_admin')
    )
    or public.auth_role() = 'super_admin'
  );

create table if not exists public.privacy_settings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null unique references public.organisations(id) on delete cascade,
  consent_message text not null default 'This interview will be recorded and transcribed by TigerHire to help evaluate your application. By clicking Continue, you consent to this recording. You may request deletion of your data at any time.',
  recording_retention_days integer not null default 90,
  transcript_retention_days integer not null default 365,
  updated_at timestamptz not null default now()
);

alter table public.privacy_settings enable row level security;

drop policy if exists "org admins can manage privacy settings" on public.privacy_settings;
create policy "org admins can manage privacy settings"
  on public.privacy_settings for all
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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists integrations_updated_at on public.integrations;
create trigger integrations_updated_at
  before update on public.integrations
  for each row execute function public.set_updated_at();
