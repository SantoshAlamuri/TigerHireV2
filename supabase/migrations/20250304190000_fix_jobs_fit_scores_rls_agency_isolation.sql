-- Fix data isolation: agencies must only see their client orgs' jobs, not all open jobs.
-- The old jobs_select policy had: (status = 'open' AND auth.uid() IS NOT NULL)
-- which let ANY authenticated user see ALL open jobs across all organisations.
-- Now only candidate roles can browse all open jobs; everyone else needs org membership.
--
-- Also fixes fit_scores RLS to use auth_organisation_ids() (plural) so agencies
-- can read scores for their client orgs' jobs.

BEGIN;

-- ============================================================
-- JOBS: tighten SELECT policy
-- ============================================================

DROP POLICY IF EXISTS "jobs_select" ON jobs;

CREATE POLICY "jobs_select"
  ON jobs FOR SELECT
  USING (
    (
      status = 'open'
      AND (SELECT public.auth_role()) IN ('candidate_pro', 'candidate_free')
    )
    OR organisation_id = ANY(public.auth_organisation_ids())
    OR (
      (SELECT public.auth_role()) = 'hiring_manager'
      AND hiring_manager_id = (SELECT auth.uid())
    )
    OR (SELECT public.auth_role()) = 'super_admin'
  );

-- ============================================================
-- FIT_SCORES: use auth_organisation_ids() so agencies see
-- scores for client org jobs (not just their own org)
-- ============================================================

DROP POLICY IF EXISTS "Org members can read scores for their jobs" ON fit_scores;

CREATE POLICY "Org members can read scores for their jobs"
  ON fit_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = fit_scores.job_id
      AND jobs.organisation_id = ANY(public.auth_organisation_ids())
    )
  );

COMMIT;
