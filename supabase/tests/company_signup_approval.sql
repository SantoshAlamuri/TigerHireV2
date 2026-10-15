-- Run against a disposable database with the signup migration applied.
-- All fixtures are rolled back; this test does not send verification emails.
BEGIN;
DO $$
DECLARE
  company_user uuid := gen_random_uuid();
  agency_user uuid := gen_random_uuid();
  candidate_user uuid := gen_random_uuid();
  second_company_user uuid := gen_random_uuid();
  company_id uuid;
  agency_id uuid;
  second_company_id uuid;
  candidate_org uuid;
  company_name text := 'Signup approval test ' || gen_random_uuid()::text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (company_user, company_user::text || '@example.invalid'),
    (agency_user, agency_user::text || '@example.invalid'),
    (candidate_user, candidate_user::text || '@example.invalid'),
    (second_company_user, second_company_user::text || '@example.invalid');

  company_id := public.register_create_org_and_profile(company_user, 'leadership', 'Test owner', company_name, 'company');
  IF NOT EXISTS (SELECT 1 FROM public.organisations WHERE id = company_id AND approval = 'approved') THEN
    RAISE EXCEPTION 'Company signup must be approved without manual activation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = company_user AND organisation_id = company_id AND role = 'leadership' AND is_org_admin) THEN
    RAISE EXCEPTION 'Company signup must preserve its owner profile';
  END IF;

  agency_id := public.register_create_org_and_profile(agency_user, 'agency', 'Test agency', company_name || ' agency', 'agency');
  IF NOT EXISTS (SELECT 1 FROM public.organisations WHERE id = agency_id AND approval = 'pending') THEN
    RAISE EXCEPTION 'Agency approval must remain pending';
  END IF;

  candidate_org := public.register_create_org_and_profile(candidate_user, 'candidate_free', 'Test candidate', NULL, NULL);
  IF candidate_org IS NOT NULL THEN
    RAISE EXCEPTION 'Candidate signup must not create an organisation';
  END IF;

  second_company_id := public.register_create_org_and_profile(second_company_user, 'leadership', 'Second owner', company_name, 'company');
  IF second_company_id = company_id OR NOT EXISTS (
    SELECT 1 FROM public.organisations WHERE id = second_company_id AND approval = 'approved'
  ) THEN
    RAISE EXCEPTION 'Duplicate company names must still produce separate approved workspaces';
  END IF;

  IF has_function_privilege('anon', 'public.register_create_org_and_profile(uuid,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.register_create_org_and_profile(uuid,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Signup transaction must not be directly accessible to browser roles';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.register_create_org_and_profile(uuid,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Server signup must retain access to the transaction';
  END IF;
END;
$$;
ROLLBACK;
