create or replace function public.oauth_provision_profile_from_sso(
  p_user_id uuid,
  p_email text,
  p_company_id uuid,
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
begin
  select *
  into v_profile
  from public.profiles
  where id = p_user_id
  limit 1;

  if found then
    if p_company_id is not null
      and (v_profile.organisation_id is null or v_profile.organisation_id <> p_company_id) then
      update public.profiles
      set organisation_id = p_company_id,
          updated_at = now()
      where id = p_user_id;
      v_profile.organisation_id := p_company_id;
    end if;

    action := 'existing';
    role := v_profile.role;
    role_status := coalesce(v_profile.role_status, 'active');
    organisation_id := v_profile.organisation_id;
    return next;
    return;
  end if;

  select *
  into v_invite
  from public.invites
  where invites.organisation_id = p_company_id
    and lower(invites.email) = lower(p_email)
    and invites.accepted_at is null
    and invites.expires_at > now()
  order by invites.created_at desc
  limit 1;

  if found then
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
      p_company_id,
      v_invite.role,
      'active',
      true,
      nullif(trim(coalesce(p_full_name, split_part(p_email, '@', 1))), '')
    );

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
      p_company_id,
      p_user_id,
      lower(p_email),
      'auth.oauth.invite_linked',
      'profile',
      p_user_id::text,
      jsonb_build_object('invite_id', v_invite.id, 'role', v_invite.role::text)
    );

    action := 'invite_linked';
    role := v_invite.role;
    role_status := 'active';
    organisation_id := p_company_id;
    return next;
    return;
  end if;

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
    p_company_id,
    null,
    'pending',
    true,
    nullif(trim(coalesce(p_full_name, split_part(p_email, '@', 1))), '')
  );

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
    p_company_id,
    p_user_id,
    lower(p_email),
    'auth.oauth.pending_created',
    'profile',
    p_user_id::text,
    jsonb_build_object('reason', 'no_matching_invite')
  );

  action := 'pending_created';
  role := null;
  role_status := 'pending';
  organisation_id := p_company_id;
  return next;
end;
$$;

revoke all on function public.oauth_provision_profile_from_sso(uuid, text, uuid, text) from public, anon;
grant execute on function public.oauth_provision_profile_from_sso(uuid, text, uuid, text) to authenticated, service_role;
