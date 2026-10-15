create or replace function public.platform_onboard_company(
  p_company_name text,
  p_primary_domain text,
  p_plan text,
  p_admin_user_id uuid,
  p_admin_first_name text,
  p_admin_last_name text,
  p_actor_user_id uuid
)
returns table(company_id uuid, admin_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_slug text;
  v_admin_name text;
begin
  v_slug := regexp_replace(lower(trim(p_company_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then
    v_slug := 'company-' || substr(encode(gen_random_bytes(6), 'hex'), 1, 12);
  end if;

  if exists (
    select 1
    from public.company_sso_mappings
    where primary_domain = lower(trim(p_primary_domain))
  ) then
    raise exception 'Domain already exists';
  end if;

  insert into public.organisations (
    type,
    name,
    slug,
    approval,
    company_plan
  )
  values (
    'company',
    trim(p_company_name),
    v_slug || '-' || substr(encode(gen_random_bytes(3), 'hex'), 1, 6),
    'approved',
    lower(trim(p_plan))
  )
  returning id into v_company_id;

  insert into public.company_sso_mappings (
    company_id,
    provider_type,
    primary_domain,
    domain_verified_at,
    status
  )
  values (
    v_company_id,
    'email_password',
    lower(trim(p_primary_domain)),
    null,
    'active'
  );

  v_admin_name := trim(coalesce(p_admin_first_name, '') || ' ' || coalesce(p_admin_last_name, ''));
  if v_admin_name = '' then
    v_admin_name := 'Company Admin';
  end if;

  insert into public.profiles (
    id,
    organisation_id,
    role,
    role_status,
    full_name,
    is_active
  )
  values (
    p_admin_user_id,
    v_company_id,
    'company_admin',
    'active',
    v_admin_name,
    true
  )
  on conflict (id) do update
  set
    organisation_id = excluded.organisation_id,
    role = excluded.role,
    role_status = excluded.role_status,
    full_name = excluded.full_name,
    is_active = true,
    updated_at = now();

  insert into public.audit_log (
    organisation_id,
    actor_user_id,
    event_type,
    resource_type,
    resource_id,
    metadata
  )
  values (
    v_company_id,
    p_actor_user_id,
    'company.onboarded',
    'organisation',
    v_company_id::text,
    jsonb_build_object('actor_type', 'platform_admin')
  );

  company_id := v_company_id;
  admin_user_id := p_admin_user_id;
  return next;
end;
$$;
