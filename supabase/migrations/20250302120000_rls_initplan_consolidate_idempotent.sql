-- Idempotent fix for Supabase linter: auth_rls_initplan (0003) and multiple_permissive_policies (0006).
-- Run this after 20250227140000; safe to run multiple times. Drops all known policy names and recreates
-- with (select auth.uid()) and (select public.auth_role())/(select public.auth_organisation_id()) for initplan.

-- =============================================================================
-- 1. APPLICATIONS: Single SELECT, single UPDATE (initplan-safe)
-- =============================================================================

DROP POLICY IF EXISTS "applications_select" ON applications;
DROP POLICY IF EXISTS "Org members can read applications for their jobs" ON applications;
DROP POLICY IF EXISTS "Org or hiring manager can update applications" ON applications;
DROP POLICY IF EXISTS "Hiring managers can update applications for assigned jobs" ON applications;
DROP POLICY IF EXISTS "Org hiring roles can update applications for their jobs" ON applications;
DROP POLICY IF EXISTS "applications_update" ON applications;

CREATE POLICY "Org members can read applications for their jobs"
  ON applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = applications.job_id
      AND public.auth_can_see_organisation(j.organisation_id)
    )
  );

CREATE POLICY "Org or hiring manager can update applications"
  ON applications FOR UPDATE
  USING (
    (
      (SELECT public.auth_role()) IN ('company_admin', 'recruiter', 'agency')
      AND EXISTS (
        SELECT 1 FROM jobs j
        WHERE j.id = applications.job_id
        AND public.auth_can_see_organisation(j.organisation_id)
      )
    )
    OR
    (
      (SELECT public.auth_role()) = 'hiring_manager'
      AND EXISTS (
        SELECT 1 FROM jobs j
        WHERE j.id = applications.job_id AND j.hiring_manager_id = (SELECT auth.uid())
      )
    )
  )
  WITH CHECK (
    (
      (SELECT public.auth_role()) IN ('company_admin', 'recruiter', 'agency')
      AND EXISTS (
        SELECT 1 FROM jobs j
        WHERE j.id = applications.job_id
        AND public.auth_can_see_organisation(j.organisation_id)
      )
    )
    OR
    (
      EXISTS (
        SELECT 1 FROM jobs j
        WHERE j.id = applications.job_id AND j.hiring_manager_id = (SELECT auth.uid())
      )
    )
  );

-- =============================================================================
-- 2. CANDIDATE_PREFERENCES: Initplan-safe (select auth.uid())
-- =============================================================================

DROP POLICY IF EXISTS "Candidates can read own preferences" ON candidate_preferences;
DROP POLICY IF EXISTS "Candidates can insert own preferences" ON candidate_preferences;
DROP POLICY IF EXISTS "Candidates can update own preferences" ON candidate_preferences;

CREATE POLICY "Candidates can read own preferences"
  ON candidate_preferences FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM candidates c
      WHERE c.id = candidate_preferences.candidate_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Candidates can insert own preferences"
  ON candidate_preferences FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM candidates c
      WHERE c.id = candidate_preferences.candidate_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Candidates can update own preferences"
  ON candidate_preferences FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM candidates c
      WHERE c.id = candidate_preferences.candidate_id
        AND c.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM candidates c
      WHERE c.id = candidate_preferences.candidate_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

-- =============================================================================
-- 3. ORCHESTRATOR_RUNS: Initplan-safe
-- =============================================================================

DROP POLICY IF EXISTS "Recruiters can start orchestrator runs" ON orchestrator_runs;

CREATE POLICY "Recruiters can start orchestrator runs"
  ON orchestrator_runs FOR INSERT
  WITH CHECK (
    (SELECT public.auth_role()) IN ('company_admin', 'recruiter', 'agency', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = orchestrator_runs.job_id
      AND (jobs.organisation_id = (SELECT public.auth_organisation_id()) OR (SELECT public.auth_role()) = 'super_admin')
    )
    AND started_by = (SELECT auth.uid())
  );

-- =============================================================================
-- 4. AGENCY_CLIENTS: Single permissive policy per action (initplan-safe)
-- =============================================================================

DROP POLICY IF EXISTS "Agency can read own client links" ON agency_clients;
DROP POLICY IF EXISTS "Super admins can read agency_clients" ON agency_clients;
DROP POLICY IF EXISTS "Agency or super_admin can read agency_clients" ON agency_clients;
DROP POLICY IF EXISTS "Agency can add clients for own org" ON agency_clients;
DROP POLICY IF EXISTS "Super admins can insert agency_clients" ON agency_clients;
DROP POLICY IF EXISTS "Agency or super_admin can insert agency_clients" ON agency_clients;
DROP POLICY IF EXISTS "Agency can delete own client links" ON agency_clients;
DROP POLICY IF EXISTS "Super admins can delete agency_clients" ON agency_clients;
DROP POLICY IF EXISTS "Agency or super_admin can delete agency_clients" ON agency_clients;

CREATE POLICY "Agency or super_admin can read agency_clients"
  ON agency_clients FOR SELECT
  USING (
    (agency_organisation_id = (SELECT public.auth_organisation_id()) AND (SELECT public.auth_role()) = 'agency')
    OR ((SELECT public.auth_role()) = 'super_admin')
  );

CREATE POLICY "Agency or super_admin can insert agency_clients"
  ON agency_clients FOR INSERT
  WITH CHECK (
    (agency_organisation_id = (SELECT public.auth_organisation_id()) AND (SELECT public.auth_role()) = 'agency')
    OR ((SELECT public.auth_role()) = 'super_admin')
  );

CREATE POLICY "Agency or super_admin can delete agency_clients"
  ON agency_clients FOR DELETE
  USING (
    (agency_organisation_id = (SELECT public.auth_organisation_id()) AND (SELECT public.auth_role()) = 'agency')
    OR ((SELECT public.auth_role()) = 'super_admin')
  );
