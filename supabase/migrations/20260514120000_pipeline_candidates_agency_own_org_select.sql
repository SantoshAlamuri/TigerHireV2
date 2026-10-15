-- Agency: my-pipeline uses service role, but interview book uses the authenticated client.
-- pipeline_candidates_select only allowed agency via agency_clients (client org link), not jobs
-- where organisation_id = the agency's own org. That hid rows from SELECT →
-- "Pipeline candidate not found for this job" while the candidate still appeared in the UI.

BEGIN;

DROP POLICY IF EXISTS pipeline_candidates_select ON public.pipeline_candidates;

CREATE POLICY pipeline_candidates_select ON public.pipeline_candidates FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.candidates candidates
      WHERE candidates.id = pipeline_candidates.candidate_id
        AND candidates.user_id = (SELECT auth.uid())
    )
    OR (EXISTS (
      SELECT 1
      FROM public.jobs jobs
      WHERE jobs.id = pipeline_candidates.job_id
        AND jobs.organisation_id = (SELECT public.auth_organisation_id())
        AND (SELECT public.auth_role()) IN (
          'company_admin'::public.app_role,
          'recruiter'::public.app_role,
          'finance'::public.app_role
        )
    ))
    OR (EXISTS (
      SELECT 1
      FROM public.jobs jobs
      WHERE jobs.id = pipeline_candidates.job_id
        AND jobs.hiring_manager_id = (SELECT auth.uid())
    ))
    OR ((SELECT public.auth_role()) = 'super_admin'::public.app_role)
    OR (
      (SELECT public.auth_role()) = 'agency'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM public.jobs j
        WHERE j.id = pipeline_candidates.job_id
          AND (
            j.organisation_id = (SELECT public.auth_organisation_id())
            OR EXISTS (
              SELECT 1
              FROM public.agency_clients ac
              WHERE ac.client_organisation_id = j.organisation_id
                AND ac.agency_organisation_id = (SELECT public.auth_organisation_id())
            )
          )
      )
    )
    OR (
      (SELECT public.auth_role()) = 'interviewer'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM public.pipeline_stages ps
        WHERE ps.id = pipeline_candidates.stage_id
          AND (
            ps.interviewer_user_id = (SELECT auth.uid())
            OR (
              ps.interviewer_email IS NOT NULL
              AND length(trim(ps.interviewer_email)) > 0
              AND lower(trim(ps.interviewer_email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
            )
          )
      )
    )
  );

COMMIT;
