-- Self-serve employer onboarding via SSO.
--
-- When an employer signs in with SSO (company mode, i.e. NOT the public/candidate flow)
-- using a business-domain email that no company has claimed yet, create the company and
-- make them its admin — instead of the old dead-end (/auth/no-access "your company has
-- not been onboarded"). The domain is "claimed" by inserting a company_sso_mappings row,
-- so the NEXT person on that domain resolves as an existing company and is told to ask
-- their admin (handled in the callback, not here).
--
-- Decisions (operator, 2026-07-17): org is ACTIVE immediately (approval='approved'); the
-- name is derived from the domain by the caller (e.g. laundryheap.com -> "Laundryheap").
--
-- Guardrails:
--   * public/free domains are rejected by the company_sso_mappings trg_block_public_domain
--     trigger (the caller also blocks them before calling this);
--   * race-safe: a UNIQUE primary_domain means a concurrent creator wins and we return
--     action='exists' with that company's id so the caller shows the "ask your admin" path;
--   * never clobbers an already-roled profile (returns 'existing').
--
-- Returns action in ('created','exists','existing').

create or replace function public.oauth_create_employer_org_from_domain(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_org_name text,
  p_domain text,
  p_provider_type text default 'oauth_google'
)
returns table (
  action text,
  role public.app_role,
  organisation_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles%rowtype;
  v_domain text := lower(trim(p_domain));
  v_org_name text := nullif(trim(coalesce(p_org_name, '')), '');
  -- Must satisfy company_sso_mappings_provider_type_check.
  v_provider text := case
    when p_provider_type in ('email_password', 'oauth_google', 'oauth_microsoft', 'oauth_okta', 'saml')
      then p_provider_type
    else 'oauth_google'
  end;
  v_slug_base text;
  v_slug text;
  v_attempt int := 0;
  v_org uuid;
  v_existing uuid;
begin
  -- Never override an already-provisioned (roled) profile.
  select * into v_profile from public.profiles where id = p_user_id limit 1;
  if found and v_profile.role is not null then
    action := 'existing';
    role := v_profile.role;
    organisation_id := v_profile.organisation_id;
    return next;
    return;
  end if;

  -- Company already claimed this domain? -> caller shows "ask your admin".
  select company_id into v_existing
  from public.company_sso_mappings
  where primary_domain = v_domain and status = 'active'
  limit 1;
  if v_existing is not null then
    action := 'exists';
    role := null;
    organisation_id := v_existing;
    return next;
    return;
  end if;

  if v_org_name is null then
    v_org_name := initcap(split_part(v_domain, '.', 1));
  end if;
  v_slug_base := trim(both '-' from regexp_replace(lower(v_org_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug_base = '' then
    v_slug_base := 'company';
  end if;
  v_slug := v_slug_base;

  begin
    -- Org (active immediately), with slug-collision retry.
    <<insert_org>>
    loop
      begin
        insert into public.organisations (type, name, slug, approval)
        values ('company'::organisation_type, v_org_name, v_slug, 'approved'::organisation_approval)
        returning id into v_org;
        exit insert_org;
      exception when unique_violation then
        v_attempt := v_attempt + 1;
        if v_attempt > 5 then
          raise;
        end if;
        v_slug := v_slug_base || '-' || substr(replace(p_user_id::text, '-', ''), 1, 6)
                  || case when v_attempt > 1 then '-' || v_attempt::text else '' end;
      end;
    end loop insert_org;

    -- Claim the domain (UNIQUE primary_domain enforces one company per domain).
    insert into public.company_sso_mappings
      (company_id, provider_type, primary_domain, domain_verified_at, status)
    values (v_org, v_provider, v_domain, now(), 'active');

    -- Creator becomes the org admin.
    insert into public.profiles (id, organisation_id, role, role_status, is_active, is_org_admin, full_name)
    values (
      p_user_id, v_org, 'leadership', 'active', true, true,
      nullif(trim(coalesce(p_full_name, split_part(p_email, '@', 1))), '')
    )
    on conflict (id) do update
      set organisation_id = excluded.organisation_id,
          role = excluded.role,
          role_status = excluded.role_status,
          is_active = excluded.is_active,
          is_org_admin = excluded.is_org_admin,
          updated_at = now();

    insert into public.audit_log
      (organisation_id, actor_user_id, actor_email, event_type, resource_type, resource_id, metadata)
    values (
      v_org, p_user_id, lower(p_email), 'auth.oauth.employer_org_created', 'organisation', v_org::text,
      jsonb_build_object('domain', v_domain, 'org_name', v_org_name, 'provider_type', v_provider, 'source', 'sso_self_serve')
    );

    action := 'created';
    role := 'leadership';
    organisation_id := v_org;
    return next;
    return;
  exception when unique_violation then
    -- A concurrent sign-in claimed this domain between our pre-check and the mapping insert.
    select company_id into v_existing
    from public.company_sso_mappings
    where primary_domain = v_domain and status = 'active'
    limit 1;
    action := 'exists';
    role := null;
    organisation_id := v_existing;
    return next;
    return;
  end;
end;
$$;

revoke all on function public.oauth_create_employer_org_from_domain(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.oauth_create_employer_org_from_domain(uuid, text, text, text, text, text) to authenticated, service_role;

-- Drop the earlier 5-arg signature if this migration is being re-applied after a change.
drop function if exists public.oauth_create_employer_org_from_domain(uuid, text, text, text, text);
