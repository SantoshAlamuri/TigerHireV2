alter table if exists public.organisations
add column if not exists enforce_2fa boolean not null default false;

comment on column public.organisations.enforce_2fa is
  'When true, password logins must complete AAL2 (TOTP/WebAuthn) before session is accepted.';
