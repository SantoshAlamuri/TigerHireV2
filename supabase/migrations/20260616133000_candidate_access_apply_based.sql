-- Candidate access model: APPLY-BASED (+ consented unlock), not fit-score-based.
-- ---------------------------------------------------------------------------
-- Product model: a candidate's data is owned by the org(s) the candidate ACTUALLY
-- APPLIED to. Cross-org "new opportunity" matching/notifications must NOT share
-- the candidate's data with a target org until the candidate applies.
--
-- Previously can_org_access_candidate granted access on EITHER an unlock OR ANY
-- fit_scores row for a job in that org. But scout (WhatsApp CV ingest) and the
-- fitscore-agent score candidates against ALL orgs' open jobs pre-apply, so the
-- fit_scores branch silently leaked candidate data to every org whose open job a
-- candidate merely matched. (Verified: it added only cross-org "scored but never
-- applied/unlocked" rows.)
--
-- New grant = consented unlock OR the candidate applied to a job in that org.
-- This also fixes a gap: an org can now see its own applicant even if scoring
-- lagged/failed. Matching/notifications may keep writing fit_scores freely — they
-- are now a candidate-facing signal only, not an access grant.
--
-- This function backs both candidates RLS (candidates_select via
-- can_caller_orgs_access_candidate) and resume storage RLS (via
-- can_caller_orgs_access_candidate_resume), so the change cascades to both.
-- Idempotent (CREATE OR REPLACE).
-- ---------------------------------------------------------------------------
create or replace function public.can_org_access_candidate(
  p_candidate_id uuid,
  p_organisation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select exists (
    select 1 from public.candidate_unlocks cu
    where cu.candidate_id = p_candidate_id
      and cu.organisation_id = p_organisation_id
  ) or exists (
    select 1 from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.candidate_id = p_candidate_id
      and j.organisation_id = p_organisation_id
  );
$function$;
