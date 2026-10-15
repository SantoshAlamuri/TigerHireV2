-- Cross-tenant leak fix. Supersedes 20260417220000_candidate_notes_hm_job_scope.sql,
-- which could never be applied: it referenced app_role 'company_admin', which does
-- not exist in the enum (the equivalent role is 'leadership'). That failure is why
-- the leak survived from April to July 2026.
--
-- Prior policy was a bare role check with no org scoping, so any recruiter-role user
-- could read every private candidate note on the platform.
-- Applied to prod (Mumbai) and preview (Sydney) 2026-07-28.

DROP POLICY IF EXISTS "Org members can read candidate notes" ON public.candidate_notes;

CREATE POLICY "Org members can read candidate notes"
  ON public.candidate_notes FOR SELECT
  USING (
    author_id = (SELECT auth.uid())
    OR (SELECT public.auth_role()) = 'super_admin'::public.app_role
    OR (
      (SELECT public.auth_role()) IN (
        'leadership'::public.app_role,
        'recruiter'::public.app_role,
        'agency'::public.app_role
      )
      AND public.can_caller_orgs_access_candidate(candidate_notes.candidate_id)
    )
    OR (
      (SELECT public.auth_role()) = 'hiring_manager'::public.app_role
      AND candidate_notes.job_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.jobs j
        WHERE j.id = candidate_notes.job_id
          AND j.hiring_manager_id = (SELECT auth.uid())
      )
    )
  );
