-- Fix: candidate-detail access should include pipeline membership.
--
-- can_org_access_candidate() previously granted access only via candidate_unlocks OR an
-- applications row. But candidates can be added straight to a job's pipeline
-- (pipeline_candidates) — e.g. recruiter bulk CV upload or agency upload — without an
-- applications row. Those candidates appear on the Pipeline page (which reads
-- pipeline_candidates) yet 404 on the candidate detail page (whose RLS reads applications).
--
-- This adds a third access path: an org may view a candidate it has in its OWN jobs' pipeline.
-- No cross-org leak — the join is constrained to jobs owned by the calling org. Keeps the
-- SECURITY DEFINER + pinned search_path of the original.

CREATE OR REPLACE FUNCTION public.can_org_access_candidate(p_candidate_id uuid, p_organisation_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
AS $function$
  select exists (
    select 1 from public.candidate_unlocks cu
    where cu.candidate_id = p_candidate_id
      and cu.organisation_id = p_organisation_id
  ) or exists (
    select 1 from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.candidate_id = p_candidate_id
      and j.organisation_id = p_organisation_id
  ) or exists (
    select 1 from public.pipeline_candidates pc
    join public.jobs j on j.id = pc.job_id
    where pc.candidate_id = p_candidate_id
      and j.organisation_id = p_organisation_id
  );
$function$;
