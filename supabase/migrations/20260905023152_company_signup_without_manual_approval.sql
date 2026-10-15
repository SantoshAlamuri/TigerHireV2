-- New self-service companies can start after email verification without manual activation.
-- Existing organisations and agency approval are intentionally unchanged.
-- CREATE OR REPLACE retains the deployed function's ownership and grants.
CREATE OR REPLACE FUNCTION public.register_create_org_and_profile(
  p_user_id uuid,
  p_role text,
  p_full_name text,
  p_org_name text DEFAULT NULL,
  p_org_type text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := NULL;
  v_slug text;
  v_approval organisation_approval;
  v_is_org_admin boolean;
BEGIN
  v_is_org_admin := (trim(p_role) = 'leadership');
  IF p_org_name IS NOT NULL AND p_org_type IS NOT NULL THEN
    v_slug := regexp_replace(lower(p_org_name), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    IF v_slug = '' THEN
      v_slug := NULL;
    END IF;
    v_approval := CASE
      WHEN p_org_type = 'agency' THEN 'pending'::organisation_approval
      WHEN p_org_type = 'company' THEN 'approved'::organisation_approval
      ELSE 'approved'::organisation_approval
    END;

    <<insert_org>>
    LOOP
      BEGIN
        INSERT INTO organisations (type, name, slug, approval)
        VALUES (
          p_org_type::organisation_type,
          p_org_name,
          v_slug,
          v_approval
        )
        RETURNING id INTO v_org_id;
        EXIT insert_org;
      EXCEPTION WHEN unique_violation THEN
        -- Slug already exists (e.g. two "Acme" companies); make unique with short suffix from user id
        v_slug := coalesce(v_slug, 'org') || '-' || substr(replace(p_user_id::text, '-', ''), 1, 8);
      END;
    END LOOP insert_org;
  END IF;

  INSERT INTO profiles (id, role, organisation_id, full_name, is_org_admin)
  VALUES (p_user_id, p_role::app_role, v_org_id, p_full_name, v_is_org_admin);

  RETURN v_org_id;
END;
$$;

-- This privileged signup transaction must only be callable by the server.
REVOKE EXECUTE ON FUNCTION public.register_create_org_and_profile(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_create_org_and_profile(uuid, text, text, text, text) TO service_role;
