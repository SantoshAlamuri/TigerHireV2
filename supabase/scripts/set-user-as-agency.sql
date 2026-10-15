-- Set a user as agency by email (e.g. lavanya@canaconsultants.in)
-- Run this in Supabase Dashboard → SQL Editor.
-- Replace the email and agency name/slug as needed.

-- 1) Optional: Create agency organisation if it doesn't exist.
--    Skip this block if the agency org already exists and you have its id.
INSERT INTO organisations (type, name, slug, approval)
VALUES (
  'agency'::organisation_type,
  'Cana Consultants',
  'cana-consultants',
  'approved'::organisation_approval
)
ON CONFLICT (slug) DO NOTHING;

-- 2) Get the agency org id (use the one you created or already have).
--    For this script we look up by slug.
DO $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_email text := 'lavanya@canaconsultants.in';
  v_agency_slug text := 'cana-consultants';
BEGIN
  -- Resolve user id from auth.users by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_email;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No auth user found with email: %', v_email;
  END IF;

  -- Resolve agency organisation id
  SELECT id INTO v_org_id
  FROM public.organisations
  WHERE type = 'agency' AND slug = v_agency_slug
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No agency organisation found with slug: %. Create it first or fix the slug.', v_agency_slug;
  END IF;

  -- Update or insert profile: set role to agency and link to org
  INSERT INTO public.profiles (id, role, organisation_id, full_name, updated_at)
  VALUES (
    v_user_id,
    'agency'::app_role,
    v_org_id,
    COALESCE((SELECT full_name FROM public.profiles WHERE id = v_user_id), 'Lavanya'),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    role = 'agency'::app_role,
    organisation_id = v_org_id,
    updated_at = now();
END $$;
