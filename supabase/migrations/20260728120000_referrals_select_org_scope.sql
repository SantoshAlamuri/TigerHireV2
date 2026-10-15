-- Cross-tenant leak: `referrals_select` granted every leadership/recruiter/agency
-- user read access to EVERY referral row platform-wide (including target_phone),
-- because the second branch was a bare role check with no org or candidate scoping.
-- `referrals` has no organisation_id, so scope through the referred candidate using
-- the same helper the `candidates` policies use.
--
-- Audit 2026-07-28 (multi-tenancy lens). Sibling of the candidate_notes fix in
-- 20260417220000_candidate_notes_hm_job_scope.sql.

DROP POLICY IF EXISTS "referrals_select" ON public.referrals;

CREATE POLICY "referrals_select"
  ON public.referrals FOR SELECT
  USING (
    referrer_id = (SELECT auth.uid())
    OR (SELECT public.auth_role()) = 'super_admin'::public.app_role
    OR (
      (SELECT public.auth_role()) IN (
        'leadership'::public.app_role,
        'recruiter'::public.app_role,
        'agency'::public.app_role
      )
      AND referrals.candidate_id IS NOT NULL
      AND public.can_caller_orgs_access_candidate(referrals.candidate_id)
    )
  );
-- Applied to prod (Mumbai) and preview (Sydney) 2026-07-28.
