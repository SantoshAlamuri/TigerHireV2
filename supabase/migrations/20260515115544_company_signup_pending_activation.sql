-- New self-service company organisations require explicit approval before product use.
-- Platform-onboarded companies remain approved (see platform_onboard_company).
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
BEGIN
  IF p_org_name IS NOT NULL AND p_org_type IS NOT NULL THEN
    v_slug := regexp_replace(lower(p_org_name), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    IF v_slug = '' THEN
      v_slug := NULL;
    END IF;
    v_approval := CASE
      WHEN p_org_type = 'agency' THEN 'pending'::organisation_approval
      WHEN p_org_type = 'company' THEN 'pending'::organisation_approval
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
        v_slug := coalesce(v_slug, 'org') || '-' || substr(replace(p_user_id::text, '-', ''), 1, 8);
      END;
    END LOOP insert_org;
  END IF;

  INSERT INTO profiles (id, role, organisation_id, full_name)
  VALUES (p_user_id, p_role::app_role, v_org_id, p_full_name);

  RETURN v_org_id;
END;
$$;
