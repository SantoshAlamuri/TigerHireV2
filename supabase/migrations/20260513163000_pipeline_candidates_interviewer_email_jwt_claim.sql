-- RLS on pipeline_candidates referenced auth.users for interviewer email matching.
-- The authenticated Postgres role cannot SELECT auth.users → 42501 "permission denied for table users"
-- (seen when loading interview prep: nested pipeline_candidates + candidates selects).
-- Use the email claim from the JWT instead; no DB read of auth.users.

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
        JOIN public.agency_clients ac ON ac.client_organisation_id = j.organisation_id
        WHERE j.id = pipeline_candidates.job_id
          AND ac.agency_organisation_id = (SELECT public.auth_organisation_id())
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

DROP POLICY IF EXISTS pipeline_stage_transitions_select ON public.pipeline_stage_transitions;

CREATE POLICY pipeline_stage_transitions_select ON public.pipeline_stage_transitions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.candidates c
      WHERE c.id = pipeline_stage_transitions.candidate_id
        AND c.user_id = (SELECT auth.uid())
    )
    OR (EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = pipeline_stage_transitions.job_id
        AND j.organisation_id = (SELECT public.auth_organisation_id())
        AND (SELECT public.auth_role()) IN (
          'company_admin'::public.app_role,
          'recruiter'::public.app_role,
          'finance'::public.app_role
        )
    ))
    OR (EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = pipeline_stage_transitions.job_id
        AND j.hiring_manager_id = (SELECT auth.uid())
    ))
    OR ((SELECT public.auth_role()) = 'super_admin'::public.app_role)
    OR (
      (SELECT public.auth_role()) = 'agency'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM public.jobs j
        JOIN public.agency_clients ac ON ac.client_organisation_id = j.organisation_id
        WHERE j.id = pipeline_stage_transitions.job_id
          AND ac.agency_organisation_id = (SELECT public.auth_organisation_id())
      )
    )
    OR (
      (SELECT public.auth_role()) = 'interviewer'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM public.pipeline_candidates pc
        JOIN public.pipeline_stages ps ON ps.id = pc.stage_id
        WHERE pc.id = pipeline_stage_transitions.pipeline_candidate_id
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
