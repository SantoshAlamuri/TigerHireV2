-- Allow all API-permitted roles to create hiring requests (not only hiring_manager).
-- Fixes company admins (leadership) and recruiters blocked by RLS on POST /api/hiring-requests.

DROP POLICY IF EXISTS "hiring_requests_insert" ON public.hiring_requests;
DROP POLICY IF EXISTS "HM can create hiring requests" ON public.hiring_requests;

CREATE POLICY "hiring_requests_insert"
  ON public.hiring_requests
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN (
      'hiring_manager'::public.app_role,
      'recruiter'::public.app_role,
      'leadership'::public.app_role,
      'super_admin'::public.app_role
    )
  );
