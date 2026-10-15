-- Tenant security, storage scoping, agency applications, hiring manager, RPC.
-- Safe to re-run (drops and recreates policies / functions).

BEGIN;

CREATE OR REPLACE FUNCTION public.auth_organisation_ids()
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  my_org uuid;
  my_role public.app_role;
  client_ids uuid[];
BEGIN
  SELECT organisation_id, role INTO my_org, my_role
  FROM public.profiles WHERE id = auth.uid();
  IF my_org IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;
  IF my_role = 'agency' THEN
    BEGIN
      SELECT COALESCE(array_agg(ac.client_organisation_id), ARRAY[]::uuid[])
      INTO client_ids
      FROM public.agency_clients ac
      WHERE ac.agency_organisation_id = my_org;
      RETURN ARRAY[my_org] || COALESCE(client_ids, ARRAY[]::uuid[]);
    EXCEPTION WHEN undefined_table THEN
      RETURN ARRAY[my_org];
    END;
  END IF;
  RETURN ARRAY[my_org];
END;
$$;

COMMENT ON FUNCTION public.auth_organisation_ids() IS 'Own org id; for agency includes client org ids when agency_clients exists. Used for RLS and storage.';

-- Returns true if current user can see the given org (own org, or agency and org is a client). Safe when agency_clients is missing.
CREATE OR REPLACE FUNCTION public.auth_can_see_organisation(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  my_org uuid;
  my_role public.app_role;
  found boolean;
BEGIN
  SELECT organisation_id, role INTO my_org, my_role
  FROM public.profiles WHERE id = auth.uid();
  IF my_org IS NULL OR p_org_id IS NULL THEN
    RETURN false;
  END IF;
  IF my_org = p_org_id THEN
    RETURN true;
  END IF;
  IF my_role = 'agency' THEN
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM public.agency_clients ac
        WHERE ac.agency_organisation_id = my_org AND ac.client_organisation_id = p_org_id
      ) INTO found;
      RETURN COALESCE(found, false);
    EXCEPTION WHEN undefined_table THEN
      RETURN false;
    END;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_org_access_candidate(
  p_candidate_id uuid,
  p_organisation_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.candidate_unlocks cu
    WHERE cu.candidate_id = p_candidate_id AND cu.organisation_id = p_organisation_id
  ) OR EXISTS (
    SELECT 1 FROM public.fit_scores fs
    JOIN public.jobs j ON j.id = fs.job_id
    WHERE fs.candidate_id = p_candidate_id AND j.organisation_id = p_organisation_id
  );
$$;

COMMENT ON FUNCTION public.can_org_access_candidate(uuid, uuid) IS 'True if org has unlock or fit_score for this candidate.';

CREATE OR REPLACE FUNCTION public.can_caller_orgs_access_candidate(p_candidate_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM unnest(public.auth_organisation_ids()) AS oid
    WHERE public.can_org_access_candidate(p_candidate_id, oid)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_caller_orgs_access_candidate_resume(p_path_first_segment text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  seg_uuid uuid;
  cid uuid;
BEGIN
  IF p_path_first_segment IS NULL OR p_path_first_segment = '' THEN
    RETURN false;
  END IF;
  BEGIN
    seg_uuid := p_path_first_segment::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  IF public.can_caller_orgs_access_candidate(seg_uuid) THEN
    RETURN true;
  END IF;
  SELECT id INTO cid FROM public.candidates WHERE user_id = seg_uuid LIMIT 1;
  IF cid IS NOT NULL AND public.can_caller_orgs_access_candidate(cid) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

DROP POLICY IF EXISTS "Org members can read applications for their jobs" ON applications;
CREATE POLICY "Org members can read applications for their jobs"
  ON applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = applications.job_id
      AND public.auth_can_see_organisation(j.organisation_id)
    )
  );

DROP POLICY IF EXISTS "Org hiring roles can update applications for their jobs" ON applications;
CREATE POLICY "Org hiring roles can update applications for their jobs"
  ON applications FOR UPDATE
  USING (
    public.auth_role() IN ('company_admin', 'recruiter', 'agency')
    AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = applications.job_id
      AND public.auth_can_see_organisation(j.organisation_id)
    )
  )
  WITH CHECK (
    public.auth_role() IN ('company_admin', 'recruiter', 'agency')
    AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = applications.job_id
      AND public.auth_can_see_organisation(j.organisation_id)
    )
  );

CREATE POLICY "Hiring managers can update applications for assigned jobs"
  ON applications FOR UPDATE
  USING (
    public.auth_role() = 'hiring_manager'
    AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = applications.job_id AND j.hiring_manager_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = applications.job_id AND j.hiring_manager_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can read own resume by candidate id path"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.user_id = auth.uid() AND (storage.foldername(name))[1] = c.id::text
    )
  );

DROP POLICY IF EXISTS "Company users can read resumes" ON storage.objects;
CREATE POLICY "Company users can read resumes for accessible candidates"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('company_admin', 'recruiter', 'super_admin', 'agency')
    )
    AND public.can_caller_orgs_access_candidate_resume((storage.foldername(name))[1])
  );

DROP POLICY IF EXISTS "Company users can read verification videos" ON storage.objects;
CREATE POLICY "Company users can read verification videos for accessible candidates"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'verification-videos'
    AND (
      EXISTS (
        SELECT 1 FROM public.candidates c
        WHERE c.user_id = auth.uid() AND (storage.foldername(name))[1] = c.id::text
      )
      OR (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('company_admin', 'recruiter', 'super_admin', 'agency')
        )
        AND public.can_caller_orgs_access_candidate_resume((storage.foldername(name))[1])
      )
    )
  );

DROP POLICY IF EXISTS "Company users can read candidate-cvs" ON storage.objects;
CREATE POLICY "Company users can read candidate-cvs for accessible candidates"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'candidate-cvs'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('company_admin', 'recruiter', 'super_admin', 'agency')
    )
    AND public.can_caller_orgs_access_candidate_resume((storage.foldername(name))[1])
  );

CREATE OR REPLACE FUNCTION public.get_accessible_candidate_ids(p_organisation_ids uuid[])
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT candidate_id FROM (
    SELECT cu.candidate_id FROM public.candidate_unlocks cu
    WHERE cu.organisation_id = ANY(p_organisation_ids)
    UNION
    SELECT fs.candidate_id FROM public.fit_scores fs
    JOIN public.jobs j ON j.id = fs.job_id
    WHERE j.organisation_id = ANY(p_organisation_ids)
  ) sub;
$$;

COMMENT ON FUNCTION public.get_accessible_candidate_ids(uuid[]) IS 'Candidate IDs accessible by any of the given orgs (unlock or fit_score). For tenant-scoped lists.';

COMMIT;
