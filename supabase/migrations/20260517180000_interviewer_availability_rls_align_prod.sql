-- Align interviewer_availability_windows RLS with production app_role enum.
-- Production apply omitted company_admin (not in live enum at Phase A apply time).
-- Option 2 from docs/tickets/interviewer-availability-rls-drift.md

BEGIN;

DROP POLICY IF EXISTS interviewer_availability_windows_select_own_org
  ON public.interviewer_availability_windows;

DROP POLICY IF EXISTS interviewer_availability_windows_insert_own
  ON public.interviewer_availability_windows;

CREATE POLICY interviewer_availability_windows_select_own_org
  ON public.interviewer_availability_windows
  FOR SELECT
  TO authenticated
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN (
      'super_admin',
      'leadership',
      'recruiter',
      'agency',
      'hiring_manager',
      'interviewer'
    )
  );

CREATE POLICY interviewer_availability_windows_insert_own
  ON public.interviewer_availability_windows
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN (
      'super_admin',
      'leadership',
      'recruiter',
      'agency',
      'hiring_manager',
      'interviewer'
    )
  );

COMMIT;
