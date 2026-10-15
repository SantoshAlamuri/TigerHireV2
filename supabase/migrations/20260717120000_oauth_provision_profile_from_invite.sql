-- OAuth invite fallback provisioning.
--
-- Context: `oauth_provision_profile_from_sso` (20260418194000) only consumes a
-- pending invite on the SSO-verified path, because it matches the invite by
-- (organisation_id = p_company_id, email). A user invited to a company whose
-- domain is NOT SSO-verified (no active company_sso_mappings row) who signs in
-- with Google therefore never gets a profile: the OAuth callback rejects them
-- before any invite is looked at, and they land in an infinite redirect / no-access
-- loop with a live auth session but no profiles row.
--
-- This function matches an outstanding invite by EMAIL ALONE (case-insensitive,
-- any organisation) and provisions the profile from it. The email is proven-owned
-- via the OAuth provider, and the invite was explicitly created by an org admin for
-- that address, so email->invite matching is the intended trust boundary.
--
-- It mirrors the invite_linked branch of oauth_provision_profile_from_sso: sets
-- role_status='active', is_active=true, stamps invites.accepted_at, and writes an
-- audit_log 'auth.oauth.invite_linked' event. It NEVER overrides an already-roled
-- profile (returns 'existing'); if a role-less pending profile already exists (e.g.
-- an earlier pending_created), it upgrades that row in place rather than inserting.

create or replace function public.oauth_provision_profile_from_invite(
  p_user_id uuid,
  p_email text,
  p_full_name text default null
)
returns table (
  action text,
  role public.app_role,
  role_status text,
  organisation_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles%rowtype;
  v_invite public.invites%rowtype;
  v_has_profile boolean := false;
begin
  select *
  into v_profile
  from public.profiles
  where id = p_user_id
  limit 1;
  v_has_profile := found;

  -- Never override an already-provisioned (roled) profile.
  if v_has_profile and v_profile.role is not null then
    action := 'existing';
    role := v_profile.role;
    role_status := coalesce(v_profile.role_status, 'active');
    organisation_id := v_profile.organisation_id;
    return next;
    return;
  end if;

  -- Most recent still-valid, unaccepted invite for this email, in any org.
  select *
  into v_invite
  from public.invites
  where lower(invites.email) = lower(p_email)
    and invites.accepted_at is null
    and invites.expires_at > now()
  order by invites.created_at desc
  limit 1;

  if not found then
    action := 'no_invite';
    role := null;
    role_status := null;
    organisation_id := null;
    return next;
    return;
  end if;

  if v_has_profile then
    -- Role-less profile already exists (e.g. an earlier pending_created row):
    -- upgrade it in place instead of inserting a duplicate.
    update public.profiles
    set organisation_id = v_invite.organisation_id,
        role = v_invite.role,
        role_status = 'active',
        is_active = true,
        full_name = coalesce(
          nullif(trim(coalesce(v_profile.full_name, '')), ''),
          nullif(trim(coalesce(p_full_name, split_part(p_email, '@', 1))), '')
        ),
        updated_at = now()
    where id = p_user_id;
  else
    insert into public.profiles (
      id,
      organisation_id,
      role,
      role_status,
      is_active,
      full_name
    )
    values (
      p_user_id,
      v_invite.organisation_id,
      v_invite.role,
      'active',
      true,
      nullif(trim(coalesce(p_full_name, split_part(p_email, '@', 1))), '')
    );
  end if;

  update public.invites
  set accepted_at = now()
  where id = v_invite.id;

  insert into public.audit_log (
    organisation_id,
    actor_user_id,
    actor_email,
    event_type,
    resource_type,
    resource_id,
    metadata
  )
  values (
    v_invite.organisation_id,
    p_user_id,
    lower(p_email),
    'auth.oauth.invite_linked',
    'profile',
    p_user_id::text,
    jsonb_build_object(
      'invite_id', v_invite.id,
      'role', v_invite.role::text,
      'source', 'email_invite_without_sso'
    )
  );

  action := 'invite_linked';
  role := v_invite.role;
  role_status := 'active';
  organisation_id := v_invite.organisation_id;
  return next;
end;
$$;

revoke all on function public.oauth_provision_profile_from_invite(uuid, text, text) from public, anon;
grant execute on function public.oauth_provision_profile_from_invite(uuid, text, text) to authenticated, service_role;
