-- Scoped integration credentials for scalable ownership:
-- platform, organisation, user

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform', 'organisation', 'user')),
  organisation_id uuid references public.organisations(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete cascade,
  provider text not null,
  auth_type text not null default 'api_key' check (auth_type in ('api_key', 'oauth')),
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error')),
  status_message text,
  secret_ref text,
  oauth_access_token text,
  oauth_refresh_token text,
  oauth_token_expires_at timestamptz,
  oauth_scopes text[],
  oauth_account_email text,
  config jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_connections_scope_owner_check check (
    (scope = 'platform' and organisation_id is null and owner_user_id is null)
    or (scope = 'organisation' and organisation_id is not null and owner_user_id is null)
    or (scope = 'user' and organisation_id is not null and owner_user_id is not null)
  )
);

create unique index if not exists uq_integration_connections_scope_provider_owner
  on public.integration_connections (
    scope,
    provider,
    coalesce(organisation_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists idx_integration_connections_org_provider
  on public.integration_connections (organisation_id, provider, scope, updated_at desc);

create index if not exists idx_integration_connections_owner_provider
  on public.integration_connections (owner_user_id, provider, scope, updated_at desc);

alter table public.integration_connections enable row level security;

drop policy if exists "integration connections select" on public.integration_connections;
create policy "integration connections select"
  on public.integration_connections for select
  using (
    -- platform: super admin only
    (scope = 'platform' and public.auth_role() = 'super_admin')
    or
    -- organisation: org members can view metadata (no raw key in API responses)
    (scope = 'organisation' and (organisation_id = public.auth_organisation_id() or public.auth_role() = 'super_admin'))
    or
    -- user: owner only, plus super admin
    (scope = 'user' and (owner_user_id = auth.uid() or public.auth_role() = 'super_admin'))
  );

drop policy if exists "integration connections write" on public.integration_connections;
create policy "integration connections write"
  on public.integration_connections for all
  using (
    (scope = 'platform' and public.auth_role() = 'super_admin')
    or
    (scope = 'organisation' and (
      (organisation_id = public.auth_organisation_id() and public.auth_role() in ('company_admin', 'super_admin'))
      or public.auth_role() = 'super_admin'
    ))
    or
    (scope = 'user' and (
      owner_user_id = auth.uid()
      or public.auth_role() = 'super_admin'
    ))
  )
  with check (
    (scope = 'platform' and public.auth_role() = 'super_admin')
    or
    (scope = 'organisation' and (
      (organisation_id = public.auth_organisation_id() and public.auth_role() in ('company_admin', 'super_admin'))
      or public.auth_role() = 'super_admin'
    ))
    or
    (scope = 'user' and (
      owner_user_id = auth.uid()
      or public.auth_role() = 'super_admin'
    ))
  );

drop trigger if exists integration_connections_updated_at on public.integration_connections;
create trigger integration_connections_updated_at
  before update on public.integration_connections
  for each row execute function public.set_updated_at();

-- Bridge: copy existing org job board credentials into scoped integrations.
insert into public.integration_connections (
  scope,
  organisation_id,
  provider,
  auth_type,
  status,
  secret_ref,
  config,
  is_default,
  created_at,
  updated_at
)
select
  'organisation',
  organisation_id,
  board,
  'api_key',
  case when is_active then 'connected' else 'disconnected' end,
  'legacy_job_board:' || encode(encrypted_credentials, 'base64'),
  jsonb_build_object(
    'legacySource', 'organisation_job_board_credentials',
    'legacyId', id
  ),
  false,
  created_at,
  updated_at
from public.organisation_job_board_credentials
on conflict do nothing;
