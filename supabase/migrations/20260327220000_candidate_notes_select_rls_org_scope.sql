-- Tighten candidate_notes SELECT: recruiter-class roles only see notes for candidates
-- their org(s) can access (unlocks / fit_scores→jobs), matching the rest of tenant RLS.
-- Note: public.candidates has no organisation_id; org linkage is via can_caller_orgs_access_candidate.

DROP POLICY IF EXISTS "Org members can read candidate notes" ON public.candidate_notes;

CREATE POLICY "Org members can read candidate notes"
  ON public.candidate_notes FOR SELECT
  USING (
    (SELECT public.auth_role()) = 'super_admin'
    OR (
      (SELECT public.auth_role()) IN ('company_admin', 'recruiter', 'agency', 'hiring_manager')
      AND public.can_caller_orgs_access_candidate(candidate_notes.candidate_id)
    )
  );
