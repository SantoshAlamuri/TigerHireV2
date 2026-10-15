-- Hiring managers: candidate_notes SELECT must be job-scoped, not org-wide via
-- can_caller_orgs_access_candidate (which follows unlocks/fit_scores across jobs).

DROP POLICY IF EXISTS "Org members can read candidate notes" ON public.candidate_notes;

CREATE POLICY "Org members can read candidate notes"
  ON public.candidate_notes FOR SELECT
  USING (
    author_id = (SELECT auth.uid())
    OR (SELECT public.auth_role()) = 'super_admin'::public.app_role
    OR (
      (SELECT public.auth_role()) IN (
        'company_admin'::public.app_role,
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

-- SUPERSEDED 2026-07-28. This file could never be applied: `company_admin` is not
-- a member of the app_role enum (the equivalent role is `leadership`), so it errors
-- with 22P02. That silent failure is why the cross-tenant leak it was written to fix
-- survived until the July audit. The corrected policy ships in
-- 20260728120100_candidate_notes_select_org_scope_fixed.sql, which is applied to
-- both databases. Do not run this file.
