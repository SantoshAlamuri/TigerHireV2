-- Link pipeline stage interviewers to profiles (internal) while keeping email+name for externals.

BEGIN;

ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS interviewer_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

ALTER TABLE public.pipeline_stages
  ALTER COLUMN interviewer_email DROP NOT NULL,
  ALTER COLUMN interviewer_name DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_interviewer_user_id
  ON public.pipeline_stages (interviewer_user_id)
  WHERE interviewer_user_id IS NOT NULL;

COMMENT ON COLUMN public.pipeline_stages.interviewer_user_id IS
  'When set, interviewer is an org member (profiles.id). Email for invites comes from auth.users.';

-- Legacy rows often had email only; derive a minimal display label for external interviewers.
UPDATE public.pipeline_stages
SET interviewer_name = trim(split_part(interviewer_email, '@', 1))
WHERE interviewer_user_id IS NULL
  AND interviewer_email IS NOT NULL
  AND length(trim(interviewer_email)) > 0
  AND (interviewer_name IS NULL OR length(trim(interviewer_name)) = 0);

-- Backfill: match stage interviewer_email to same-org active profile via auth.users email.
UPDATE public.pipeline_stages ps
SET interviewer_user_id = p.id
FROM public.jobs j
JOIN public.profiles p ON p.organisation_id = j.organisation_id AND p.is_active = true
JOIN auth.users u ON u.id = p.id
WHERE j.id = ps.job_id
  AND ps.interviewer_user_id IS NULL
  AND ps.interviewer_email IS NOT NULL
  AND length(trim(ps.interviewer_email)) > 0
  AND lower(trim(u.email::text)) = lower(trim(ps.interviewer_email));

-- Interviewer role: allow pipeline_candidates when assigned by user id OR legacy email match on auth.users.
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
              AND lower(trim(ps.interviewer_email)) = lower(trim(
                COALESCE((SELECT email::text FROM auth.users WHERE id = auth.uid()), '')
              ))
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
              AND lower(trim(ps.interviewer_email)) = lower(trim(
                COALESCE((SELECT email::text FROM auth.users WHERE id = auth.uid()), '')
              ))
            )
          )
      )
    )
  );

COMMIT;
