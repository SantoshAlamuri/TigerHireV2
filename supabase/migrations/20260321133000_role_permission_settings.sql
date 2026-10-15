-- Editable role permissions for org-level settings controls.

create table if not exists public.role_permission_settings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null unique references public.organisations(id) on delete cascade,
  permissions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.role_permission_settings enable row level security;

drop policy if exists "org admins can manage role permissions" on public.role_permission_settings;
create policy "org admins can manage role permissions"
  on public.role_permission_settings for all
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

drop trigger if exists role_permission_settings_updated_at on public.role_permission_settings;
create trigger role_permission_settings_updated_at
  before update on public.role_permission_settings
  for each row execute function public.set_updated_at();
