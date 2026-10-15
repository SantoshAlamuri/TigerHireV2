create or replace function public.auth_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (
      select p.is_platform_admin
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

create or replace function public.auth_role_status()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (
      select p.role_status
      from public.profiles p
      where p.id = auth.uid()
    ),
    'pending'
  );
$$;

drop policy if exists "platform admins can read all profiles" on public.profiles;
create policy "platform admins can read all profiles"
  on public.profiles
  for select
  using (public.auth_is_platform_admin());

drop policy if exists "active users only read candidates" on public.candidates;
create policy "active users only read candidates"
  on public.candidates
  for select
  using (public.auth_role_status() = 'active');

drop policy if exists "active users only read hiring requests" on public.hiring_requests;
create policy "active users only read hiring requests"
  on public.hiring_requests
  for select
  using (public.auth_role_status() = 'active');

drop policy if exists "active users only read offers" on public.offers;
create policy "active users only read offers"
  on public.offers
  for select
  using (public.auth_role_status() = 'active');

drop policy if exists "active users only read invites" on public.invites;
create policy "active users only read invites"
  on public.invites
  for select
  using (public.auth_role_status() = 'active');

revoke all on function public.auth_is_platform_admin() from public;
revoke all on function public.auth_is_platform_admin() from anon;
grant execute on function public.auth_is_platform_admin() to authenticated;
grant execute on function public.auth_is_platform_admin() to service_role;

revoke all on function public.auth_role_status() from public;
revoke all on function public.auth_role_status() from anon;
grant execute on function public.auth_role_status() to authenticated;
grant execute on function public.auth_role_status() to service_role;
