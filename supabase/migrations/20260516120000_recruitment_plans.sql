-- Brief 11: recruitment plans (plan-first hiring execution, Phase A).

BEGIN;

CREATE TABLE public.recruitment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  job_id uuid NOT NULL UNIQUE REFERENCES public.jobs (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  target_days_to_fill integer DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles (id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.plan_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.recruitment_plans (id) ON DELETE CASCADE,
  stage_order integer NOT NULL,
  stage_type text NOT NULL CHECK (
    stage_type IN (
      'application_review',
      'phone_screen',
      'interview',
      'assessment',
      'approval',
      'offer',
      'custom'
    )
  ),
  display_name text NOT NULL,
  primary_interviewer_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  backup_interviewer_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  duration_minutes integer,
  format text CHECK (format IN ('video', 'phone', 'in_person', 'async')),
  scorecard_template_id uuid,
  comms_template_id text,
  approval_gate text NOT NULL DEFAULT 'none' CHECK (
    approval_gate IN ('none', 'recruiter', 'hm', 'recruiter_and_hm', 'finance_recruiter_hm')
  ),
  target_dwell_days integer NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, stage_order)
);

CREATE TABLE public.plan_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.recruitment_plans (id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.candidates (id) ON DELETE SET NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('human', 'system', 'agent')),
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_summary text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recruitment_plans_org ON public.recruitment_plans (organisation_id);
CREATE INDEX idx_recruitment_plans_job ON public.recruitment_plans (job_id);
CREATE INDEX idx_plan_stages_plan_order ON public.plan_stages (plan_id, stage_order);
CREATE INDEX idx_plan_history_plan ON public.plan_history (plan_id, created_at DESC);

COMMENT ON TABLE public.recruitment_plans IS 'Per-job recruitment plan (Brief 11); central workflow definition.';
COMMENT ON TABLE public.plan_stages IS 'Ordered stages within a recruitment plan.';
COMMENT ON TABLE public.plan_history IS 'Append-only human/system/agent actions for a plan.';

ALTER TABLE public.recruitment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_history ENABLE ROW LEVEL SECURITY;

-- recruitment_plans
CREATE POLICY recruitment_plans_select ON public.recruitment_plans FOR SELECT
  USING (
    public.auth_role() = 'super_admin'::public.app_role
    OR organisation_id = ANY (public.auth_organisation_ids())
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = recruitment_plans.job_id
        AND j.hiring_manager_id = auth.uid()
    )
  );

CREATE POLICY recruitment_plans_insert ON public.recruitment_plans FOR INSERT
  WITH CHECK (
    public.auth_role() = 'super_admin'::public.app_role
    OR (
      public.auth_role() IN (
        'leadership'::public.app_role,
        'recruiter'::public.app_role,
        'agency'::public.app_role,
        'hiring_manager'::public.app_role
      )
      AND organisation_id = ANY (public.auth_organisation_ids())
    )
  );

CREATE POLICY recruitment_plans_update ON public.recruitment_plans FOR UPDATE
  USING (
    public.auth_role() = 'super_admin'::public.app_role
    OR (
      public.auth_role() IN (
        'leadership'::public.app_role,
        'recruiter'::public.app_role,
        'agency'::public.app_role,
        'hiring_manager'::public.app_role
      )
      AND organisation_id = ANY (public.auth_organisation_ids())
    )
  )
  WITH CHECK (
    public.auth_role() = 'super_admin'::public.app_role
    OR organisation_id = ANY (public.auth_organisation_ids())
  );

-- plan_stages (via plan org)
CREATE POLICY plan_stages_select ON public.plan_stages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.recruitment_plans rp
      WHERE rp.id = plan_stages.plan_id
        AND (
          public.auth_role() = 'super_admin'::public.app_role
          OR rp.organisation_id = ANY (public.auth_organisation_ids())
          OR EXISTS (
            SELECT 1 FROM public.jobs j
            WHERE j.id = rp.job_id AND j.hiring_manager_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY plan_stages_insert ON public.plan_stages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recruitment_plans rp
      WHERE rp.id = plan_stages.plan_id
        AND (
          public.auth_role() = 'super_admin'::public.app_role
          OR (
            public.auth_role() IN (
              'leadership'::public.app_role,
              'recruiter'::public.app_role,
              'agency'::public.app_role,
              'hiring_manager'::public.app_role
            )
            AND rp.organisation_id = ANY (public.auth_organisation_ids())
          )
        )
    )
  );

CREATE POLICY plan_stages_update ON public.plan_stages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.recruitment_plans rp
      WHERE rp.id = plan_stages.plan_id
        AND (
          public.auth_role() = 'super_admin'::public.app_role
          OR (
            public.auth_role() IN (
              'leadership'::public.app_role,
              'recruiter'::public.app_role,
              'agency'::public.app_role,
              'hiring_manager'::public.app_role
            )
            AND rp.organisation_id = ANY (public.auth_organisation_ids())
          )
        )
    )
  );

CREATE POLICY plan_stages_delete ON public.plan_stages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.recruitment_plans rp
      WHERE rp.id = plan_stages.plan_id
        AND (
          public.auth_role() = 'super_admin'::public.app_role
          OR (
            public.auth_role() IN (
              'leadership'::public.app_role,
              'recruiter'::public.app_role,
              'agency'::public.app_role
            )
            AND rp.organisation_id = ANY (public.auth_organisation_ids())
          )
        )
    )
  );

-- plan_history
CREATE POLICY plan_history_select ON public.plan_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.recruitment_plans rp
      WHERE rp.id = plan_history.plan_id
        AND (
          public.auth_role() = 'super_admin'::public.app_role
          OR rp.organisation_id = ANY (public.auth_organisation_ids())
          OR EXISTS (
            SELECT 1 FROM public.jobs j
            WHERE j.id = rp.job_id AND j.hiring_manager_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY plan_history_insert ON public.plan_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recruitment_plans rp
      WHERE rp.id = plan_history.plan_id
        AND (
          public.auth_role() = 'super_admin'::public.app_role
          OR rp.organisation_id = ANY (public.auth_organisation_ids())
        )
    )
  );

COMMIT;
