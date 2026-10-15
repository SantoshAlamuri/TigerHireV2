-- Atomic employee onboarding: candidate status + profile role update
-- Replaces multiple sequential queries in EmployeeRepository.onboardAsEmployee

CREATE OR REPLACE FUNCTION onboard_employee_tx(
  p_candidate_id UUID,
  p_company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_result JSONB;
BEGIN
  UPDATE candidates
  SET employment_status = 'active_employee',
      employer_company_id = p_company_id
  WHERE id = p_candidate_id;

  SELECT user_id INTO v_user_id
  FROM candidates WHERE id = p_candidate_id;

  IF v_user_id IS NOT NULL THEN
    UPDATE profiles
    SET role = 'employee',
        organisation_id = p_company_id,
        updated_at = NOW()
    WHERE id = v_user_id
      AND organisation_id IS NULL;
  END IF;

  v_result = jsonb_build_object(
    'candidate_id', p_candidate_id,
    'company_id', p_company_id,
    'user_id', v_user_id
  );

  RETURN v_result;
END;
$$;
