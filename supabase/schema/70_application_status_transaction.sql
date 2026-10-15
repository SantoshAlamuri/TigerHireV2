-- Atomic application status update: status + delivery_feedback + onboard + notification
-- Replaces multiple sequential queries in ApplicationService.updateStatus

CREATE OR REPLACE FUNCTION update_application_status_tx(
  p_application_id UUID,
  p_status TEXT,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_app RECORD;
  v_candidate_user_id UUID;
  v_job_title TEXT;
  v_org_id UUID;
  v_result JSONB;
BEGIN
  UPDATE applications
  SET status = p_status::application_status,
      viewed_at = CASE WHEN p_status = 'viewed' THEN NOW() ELSE viewed_at END,
      updated_at = NOW()
  WHERE id = p_application_id
  RETURNING * INTO v_app;

  IF v_app IS NULL THEN
    RAISE EXCEPTION 'Application not found: %', p_application_id;
  END IF;

  -- Terminal-state feedback for FitScore retraining
  IF p_status IN ('hired', 'rejected') THEN
    INSERT INTO delivery_feedback (job_id, candidate_id, outcome)
    VALUES (v_app.job_id, v_app.candidate_id, p_status)
    ON CONFLICT (job_id, candidate_id) DO UPDATE SET outcome = p_status;
  END IF;

  -- Onboard candidate as employee when hired
  IF p_status = 'hired' THEN
    SELECT organisation_id INTO v_org_id
    FROM jobs WHERE id = v_app.job_id;

    IF v_org_id IS NOT NULL THEN
      UPDATE candidates
      SET employment_status = 'active_employee',
          employer_company_id = v_org_id
      WHERE id = v_app.candidate_id;

      SELECT user_id INTO v_candidate_user_id
      FROM candidates WHERE id = v_app.candidate_id;

      IF v_candidate_user_id IS NOT NULL THEN
        UPDATE profiles
        SET role = 'employee',
            organisation_id = v_org_id,
            updated_at = NOW()
        WHERE id = v_candidate_user_id
          AND organisation_id IS NULL;
      END IF;
    END IF;
  END IF;

  -- Resolve candidate user_id (may already be set from hire branch)
  IF v_candidate_user_id IS NULL THEN
    SELECT user_id INTO v_candidate_user_id
    FROM candidates WHERE id = v_app.candidate_id;
  END IF;

  SELECT title INTO v_job_title
  FROM jobs WHERE id = v_app.job_id;

  -- In-app notification for relevant status transitions
  IF v_candidate_user_id IS NOT NULL
     AND p_status IN ('viewed', 'shortlisted', 'rejected', 'hired') THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      v_candidate_user_id,
      'application_update',
      'Application ' || CASE p_status
        WHEN 'viewed'      THEN 'viewed'
        WHEN 'shortlisted' THEN 'shortlisted'
        WHEN 'rejected'    THEN 'not selected'
        WHEN 'hired'       THEN 'hired'
      END,
      'Your application for "' || COALESCE(v_job_title, 'a role') || '" has been ' ||
      CASE p_status
        WHEN 'viewed'      THEN 'viewed'
        WHEN 'shortlisted' THEN 'shortlisted'
        WHEN 'rejected'    THEN 'not selected'
        WHEN 'hired'       THEN 'hired'
      END || '.',
      '/candidate/applications'
    );
  END IF;

  v_result = jsonb_build_object(
    'id', v_app.id,
    'job_id', v_app.job_id,
    'candidate_id', v_app.candidate_id,
    'status', p_status,
    'candidate_user_id', v_candidate_user_id
  );

  RETURN v_result;
END;
$$;
