-- 74: Industry-standard tenant security, storage scoping, agency applications, hiring manager, and performance RPC.
-- Run after 73_agency_clients_rls.sql and 12_storage.sql / 21_storage_candidate_cvs.sql.
-- Safe to re-run (drops and recreates policies / functions).

BEGIN;

-- =============================================================================
-- Helper: Organisation IDs for current user (own org + client orgs for agency)
-- =============================================================================

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

-- =============================================================================
-- Can org access candidate (unlock or fit_score for a job of that org)
-- =============================================================================

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

-- =============================================================================
-- Can caller's org(s) access this candidate (for storage/RLS)
-- =============================================================================

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

-- =============================================================================
-- Storage: first path segment as candidate_id – can caller orgs access?
-- Path segment may be candidate_id (resumes/verification-videos) or legacy user_id.
-- We treat segment as candidate_id; if it is user_id, candidates.id = user_id won't match
-- but candidates.user_id = segment might. So check both: segment as candidate_id, or
-- candidate where user_id = segment.
-- =============================================================================

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
  -- Segment as candidate_id
  IF public.can_caller_orgs_access_candidate(seg_uuid) THEN
    RETURN true;
  END IF;
  -- Segment as user_id: find candidate and check
  SELECT id INTO cid FROM public.candidates WHERE user_id = seg_uuid LIMIT 1;
  IF cid IS NOT NULL AND public.can_caller_orgs_access_candidate(cid) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

-- =============================================================================
-- APPLICATIONS: Agency can read/update applications for client jobs
-- =============================================================================

-- Agency read: applications where job.organisation_id is visible to user (own org or agency's client). Safe when agency_clients missing.
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

-- Hiring managers can update applications for their assigned jobs
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

-- =============================================================================
-- STORAGE: Tenant-scoped read for company users (resumes bucket)
-- Own read: by user_id (legacy) or by candidate_id path (upload-resume uses candidate_id/filename)
-- =============================================================================

-- Allow candidates to upload to resumes when path = {candidate_id}/... (upload-resume API convention)
CREATE POLICY "Candidates can upload own resume by candidate id path"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'resumes'
    AND EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.user_id = auth.uid() AND (storage.foldername(name))[1] = c.id::text
    )
  );

-- Allow candidates to read own resume when path is candidate_id/... (upload-resume convention)
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

-- =============================================================================
-- STORAGE: Tenant-scoped read for verification-videos (path: candidate_id/file)
-- =============================================================================

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

-- =============================================================================
-- STORAGE: Tenant-scoped read for candidate-cvs bucket
-- =============================================================================

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

-- =============================================================================
-- RPC: Accessible candidate IDs for given orgs (performance/scalability)
-- App can call this instead of two client queries when org list is large.
-- =============================================================================

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
