-- Job-scoped access for hiring_manager (Greenhouse/Lever-style default).
-- HMs must not read org-wide jobs, applications, offers, pipeline, fit_scores, etc.
-- Finance / company_admin / recruiter / agency / super_admin retain org-wide patterns where applicable.

BEGIN;

-- ---------------------------------------------------------------------------
-- jobs: HM must not use the blanket org visibility branch
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "jobs_select" ON public.jobs;

CREATE POLICY "jobs_select"
  ON public.jobs FOR SELECT
  USING (
    (
      status = 'open'
      AND (SELECT public.auth_role()) IN ('candidate_pro', 'candidate_free')
    )
    OR (SELECT public.auth_role()) = 'super_admin'
    OR (
      organisation_id = ANY (public.auth_organisation_ids())
      AND (SELECT public.auth_role()) IS DISTINCT FROM 'hiring_manager'::public.app_role
    )
    OR (
      (SELECT public.auth_role()) = 'hiring_manager'::public.app_role
      AND hiring_manager_id = (SELECT auth.uid())
      AND organisation_id = ANY (public.auth_organisation_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- applications: HM SELECT only for jobs they own
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Org members can read applications for their jobs" ON public.applications;

CREATE POLICY "Org members can read applications for their jobs"
  ON public.applications FOR SELECT
  USING (
    (SELECT public.auth_role()) = 'super_admin'::public.app_role
    OR (
      (SELECT public.auth_role()) = 'hiring_manager'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM public.jobs j
        WHERE j.id = applications.job_id
          AND j.hiring_manager_id = (SELECT auth.uid())
      )
    )
    OR (
      (SELECT public.auth_role()) IS DISTINCT FROM 'hiring_manager'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM public.jobs j
        WHERE j.id = applications.job_id
          AND public.auth_can_see_organisation (j.organisation_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- offers: HM read/write/create only when linked application job is theirs;
-- candidates read own rows via application join
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "offers org read" ON public.offers;
DROP POLICY IF EXISTS "offers org create" ON public.offers;
DROP POLICY IF EXISTS "offers org update" ON public.offers;

CREATE POLICY "offers org read"
  ON public.offers FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND (
      (SELECT public.auth_role()) = 'super_admin'::public.app_role
      OR (SELECT public.auth_role()) IN (
        'company_admin'::public.app_role,
        'recruiter'::public.app_role,
        'finance'::public.app_role
      )
      OR (
        (SELECT public.auth_role()) IN ('candidate_pro'::public.app_role, 'candidate_free'::public.app_role)
        AND EXISTS (
          SELECT 1
          FROM public.applications a
          JOIN public.candidates c ON c.id = a.candidate_id
          WHERE a.id = offers.application_id
            AND c.user_id = (SELECT auth.uid())
        )
      )
      OR (
        (SELECT public.auth_role()) = 'hiring_manager'::public.app_role
        AND EXISTS (
          SELECT 1
          FROM public.applications a
          JOIN public.jobs j ON j.id = a.job_id
          WHERE a.id = offers.application_id
            AND j.hiring_manager_id = (SELECT auth.uid())
        )
      )
    )
  );

CREATE POLICY "offers org create"
  ON public.offers FOR INSERT
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND (
      (SELECT public.auth_role()) IN (
        'company_admin'::public.app_role,
        'recruiter'::public.app_role,
        'super_admin'::public.app_role
      )
      OR (
        (SELECT public.auth_role()) = 'hiring_manager'::public.app_role
        AND EXISTS (
          SELECT 1
          FROM public.applications a
          JOIN public.jobs j ON j.id = a.job_id
          WHERE a.id = offers.application_id
            AND j.hiring_manager_id = (SELECT auth.uid())
        )
      )
    )
  );

CREATE POLICY "offers org update"
  ON public.offers FOR UPDATE
  USING (
    organisation_id = public.auth_organisation_id()
    AND (
      (SELECT public.auth_role()) IN (
        'company_admin'::public.app_role,
        'recruiter'::public.app_role,
        'super_admin'::public.app_role
      )
      OR (
        (SELECT public.auth_role()) = 'hiring_manager'::public.app_role
        AND EXISTS (
          SELECT 1
          FROM public.applications a
          JOIN public.jobs j ON j.id = a.job_id
          WHERE a.id = offers.application_id
            AND j.hiring_manager_id = (SELECT auth.uid())
        )
      )
    )
  )
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND (
      (SELECT public.auth_role()) IN (
        'company_admin'::public.app_role,
        'recruiter'::public.app_role,
        'super_admin'::public.app_role
      )
      OR (
        (SELECT public.auth_role()) = 'hiring_manager'::public.app_role
        AND EXISTS (
          SELECT 1
          FROM public.applications a
          JOIN public.jobs j ON j.id = a.job_id
          WHERE a.id = offers.application_id
            AND j.hiring_manager_id = (SELECT auth.uid())
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- offer_approvals: scope HM reads to offers on their jobs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "offer approvals org read" ON public.offer_approvals;

CREATE POLICY "offer approvals org read"
  ON public.offer_approvals FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.offers o
      WHERE o.id = offer_approvals.offer_id
        AND o.organisation_id = public.auth_organisation_id()
        AND (
          (SELECT public.auth_role()) IN (
            'company_admin'::public.app_role,
            'recruiter'::public.app_role,
            'finance'::public.app_role,
            'super_admin'::public.app_role
          )
          OR (
            (SELECT public.auth_role()) = 'hiring_manager'::public.app_role
            AND EXISTS (
              SELECT 1
              FROM public.applications a
              JOIN public.jobs j ON j.id = a.job_id
              WHERE a.id = o.application_id
                AND j.hiring_manager_id = (SELECT auth.uid())
            )
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- offer_candidate_responses
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "offer responses org read" ON public.offer_candidate_responses;

CREATE POLICY "offer responses org read"
  ON public.offer_candidate_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.offers o
      WHERE o.id = offer_candidate_responses.offer_id
        AND o.organisation_id = public.auth_organisation_id()
        AND (
          (SELECT public.auth_role()) IN (
            'company_admin'::public.app_role,
            'recruiter'::public.app_role,
            'finance'::public.app_role,
            'super_admin'::public.app_role
          )
          OR (
            (SELECT public.auth_role()) = 'hiring_manager'::public.app_role
            AND EXISTS (
              SELECT 1
              FROM public.applications a
              JOIN public.jobs j ON j.id = a.job_id
              WHERE a.id = o.application_id
                AND j.hiring_manager_id = (SELECT auth.uid())
            )
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- offer_events (native signing timeline)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS offer_events_org_read ON public.offer_events;

CREATE POLICY offer_events_org_read
  ON public.offer_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.offers o
      WHERE o.id = offer_events.offer_id
        AND o.organisation_id = public.auth_organisation_id()
        AND (
          (SELECT public.auth_role()) IN (
            'company_admin'::public.app_role,
            'recruiter'::public.app_role,
            'finance'::public.app_role
          )
          OR (
            (SELECT public.auth_role()) = 'hiring_manager'::public.app_role
            AND EXISTS (
              SELECT 1
              FROM public.applications a
              JOIN public.jobs j ON j.id = a.job_id
              WHERE a.id = o.application_id
                AND j.hiring_manager_id = (SELECT auth.uid())
            )
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- workflow_instances / workflow_stages: HM only for offer workflows on their jobs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "workflow instances org read" ON public.workflow_instances;

CREATE POLICY "workflow instances org read"
  ON public.workflow_instances FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND (
      (SELECT public.auth_role()) IN (
        'company_admin'::public.app_role,
        'recruiter'::public.app_role,
        'finance'::public.app_role,
        'super_admin'::public.app_role
      )
      OR (
        (SELECT public.auth_role()) = 'hiring_manager'::public.app_role
        AND subject_type = 'offer'
        AND EXISTS (
          SELECT 1
          FROM public.offers o
          JOIN public.applications a ON a.id = o.application_id
          JOIN public.jobs j ON j.id = a.job_id
          WHERE o.id = workflow_instances.subject_id
            AND j.hiring_manager_id = (SELECT auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "workflow stages org read" ON public.workflow_stages;

CREATE POLICY "workflow stages org read"
  ON public.workflow_stages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workflow_instances wi
      WHERE wi.id = workflow_stages.instance_id
        AND wi.organisation_id = public.auth_organisation_id()
        AND (
          (SELECT public.auth_role()) IN (
            'company_admin'::public.app_role,
            'recruiter'::public.app_role,
            'finance'::public.app_role,
            'super_admin'::public.app_role
          )
          OR (
            (SELECT public.auth_role()) = 'hiring_manager'::public.app_role
            AND wi.subject_type = 'offer'
            AND EXISTS (
              SELECT 1
              FROM public.offers o
              JOIN public.applications a ON a.id = o.application_id
              JOIN public.jobs j ON j.id = a.job_id
              WHERE o.id = wi.subject_id
                AND j.hiring_manager_id = (SELECT auth.uid())
            )
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- assessments: HM org-wide read removed — scope via application → job
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "assessments org read" ON public.assessments;
DROP POLICY IF EXISTS "assessments org write" ON public.assessments;

CREATE POLICY "assessments org read"
  ON public.assessments FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND (
      (SELECT public.auth_role()) IN (
        'company_admin'::public.app_role,
        'recruiter'::public.app_role,
        'super_admin'::public.app_role
      )
      OR (
        (SELECT public.auth_role()) = 'hiring_manager'::public.app_role
        AND EXISTS (
          SELECT 1
          FROM public.applications a
          JOIN public.jobs j ON j.id = a.job_id
          WHERE a.id = assessments.application_id
            AND j.hiring_manager_id = (SELECT auth.uid())
        )
      )
    )
  );

CREATE POLICY "assessments org write"
  ON public.assessments FOR ALL
  USING (
    organisation_id = public.auth_organisation_id()
    AND (
      (SELECT public.auth_role()) IN (
        'company_admin'::public.app_role,
        'recruiter'::public.app_role,
        'super_admin'::public.app_role
      )
      OR (
        (SELECT public.auth_role()) = 'hiring_manager'::public.app_role
        AND EXISTS (
          SELECT 1
          FROM public.applications a
          JOIN public.jobs j ON j.id = a.job_id
          WHERE a.id = assessments.application_id
            AND j.hiring_manager_id = (SELECT auth.uid())
        )
      )
    )
  )
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND (
      (SELECT public.auth_role()) IN (
        'company_admin'::public.app_role,
        'recruiter'::public.app_role,
        'super_admin'::public.app_role
      )
      OR (
        (SELECT public.auth_role()) = 'hiring_manager'::public.app_role
        AND EXISTS (
          SELECT 1
          FROM public.applications a
          JOIN public.jobs j ON j.id = a.job_id
          WHERE a.id = assessments.application_id
            AND j.hiring_manager_id = (SELECT auth.uid())
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- fit_scores: HM only for jobs they own
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Org members can read scores for their jobs" ON public.fit_scores;

CREATE POLICY "Org members can read scores for their jobs"
  ON public.fit_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.jobs jobs
      WHERE jobs.id = fit_scores.job_id
        AND (
          (
            jobs.organisation_id = ANY (public.auth_organisation_ids())
            AND (SELECT public.auth_role()) IS DISTINCT FROM 'hiring_manager'::public.app_role
          )
          OR (
            (SELECT public.auth_role()) = 'hiring_manager'::public.app_role
            AND jobs.hiring_manager_id = (SELECT auth.uid())
          )
          OR (SELECT public.auth_role ()) = 'super_admin'::public.app_role
        )
    )
  );

-- ---------------------------------------------------------------------------
-- compensation_bands: remove HM org-wide comp band listing (offer routes use service role)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "compensation bands org read" ON public.compensation_bands;

CREATE POLICY "compensation bands org read"
  ON public.compensation_bands FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND (SELECT public.auth_role()) IN (
      'company_admin'::public.app_role,
      'recruiter'::public.app_role,
      'finance'::public.app_role,
      'super_admin'::public.app_role
    )
  );

-- ---------------------------------------------------------------------------
-- pipeline_candidates: replace blanket org branch; add interviewer path
-- ---------------------------------------------------------------------------
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
        JOIN public.profiles p ON p.id = (SELECT auth.uid())
        WHERE ps.id = pipeline_candidates.stage_id
          AND lower(trim(ps.interviewer_email)) = lower(trim(p.email))
      )
    )
  );

-- ---------------------------------------------------------------------------
-- pipeline_stage_transitions SELECT: mirror pipeline_candidates
-- ---------------------------------------------------------------------------
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
        JOIN public.profiles p ON p.id = (SELECT auth.uid())
        WHERE pc.id = pipeline_stage_transitions.pipeline_candidate_id
          AND lower(trim(ps.interviewer_email)) = lower(trim(p.email))
      )
    )
  );

COMMIT;
