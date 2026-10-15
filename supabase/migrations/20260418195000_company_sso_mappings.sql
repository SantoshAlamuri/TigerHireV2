create extension if not exists citext;

alter table public.profiles
  add column if not exists is_platform_admin boolean not null default false,
  add column if not exists role_status text not null default 'active';

alter table public.profiles
  alter column role drop not null;

alter table public.profiles
  drop constraint if exists profiles_role_status_check;
alter table public.profiles
  add constraint profiles_role_status_check
  check (role_status in ('pending', 'active', 'suspended'));

alter table public.profiles
  drop constraint if exists active_users_have_role;
alter table public.profiles
  add constraint active_users_have_role
  check (role_status != 'active' or role is not null);

create table if not exists public.company_sso_mappings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.organisations(id) on delete cascade,
  provider_type text not null check (
    provider_type in ('email_password', 'oauth_google', 'oauth_microsoft', 'oauth_okta', 'saml')
  ),
  provider_config_id text,
  primary_domain citext not null,
  domain_verified_at timestamptz,
  domain_verification_token text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (primary_domain)
);

create index if not exists idx_sso_mappings_domain on public.company_sso_mappings(primary_domain);
create index if not exists idx_sso_mappings_company on public.company_sso_mappings(company_id);

drop trigger if exists company_sso_mappings_updated_at on public.company_sso_mappings;
create trigger company_sso_mappings_updated_at
  before update on public.company_sso_mappings
  for each row execute function public.set_updated_at();

create table if not exists public.blocked_public_domains (
  domain citext primary key
);

insert into public.blocked_public_domains (domain) values
  ('gmail.com'),
  ('googlemail.com'),
  ('outlook.com'),
  ('hotmail.com'),
  ('live.com'),
  ('yahoo.com'),
  ('icloud.com'),
  ('me.com'),
  ('mac.com'),
  ('aol.com'),
  ('protonmail.com'),
  ('proton.me'),
  ('zoho.com'),
  ('yandex.com'),
  ('mail.com'),
  ('gmx.com'),
  ('fastmail.com')
on conflict (domain) do nothing;

create or replace function public.prevent_public_domain_claim()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.blocked_public_domains b
    where b.domain = lower(new.primary_domain)::citext
  ) then
    raise exception 'Public email domain cannot be claimed by a company';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_public_domain on public.company_sso_mappings;
create trigger trg_block_public_domain
  before insert or update on public.company_sso_mappings
  for each row execute function public.prevent_public_domain_claim();

alter table public.company_sso_mappings enable row level security;

drop policy if exists "company sso mappings select" on public.company_sso_mappings;
create policy "company sso mappings select"
  on public.company_sso_mappings
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_platform_admin = true
          or p.organisation_id = company_sso_mappings.company_id
        )
    )
  );

drop policy if exists "platform admins manage company sso mappings" on public.company_sso_mappings;
create policy "platform admins manage company sso mappings"
  on public.company_sso_mappings
  for all
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_platform_admin = true
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_platform_admin = true
    )
  );

do $$
begin
  alter table auth.users
    add column if not exists email_domain text
    generated always as (lower(split_part(email, '@', 2))) stored;
exception
  when insufficient_privilege then
    null;
end $$;
