BEGIN;

-- Requisition/JD templates (org-scoped authoring library).
CREATE TABLE IF NOT EXISTS public.requisition_jd_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  name text NOT NULL,
  role_level text,
  department text,
  summary text,
  keywords text[] NOT NULL DEFAULT '{}',
  template_text text,
  jd_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_req_jd_templates_org_active
  ON public.requisition_jd_templates (organisation_id, is_active, updated_at DESC);

ALTER TABLE public.requisition_jd_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "requisition templates org read"
  ON public.requisition_jd_templates
  FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'hiring_manager', 'finance', 'super_admin')
  );

CREATE POLICY "requisition templates org write"
  ON public.requisition_jd_templates
  FOR ALL
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'super_admin')
  )
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'super_admin')
  );

ALTER TABLE public.hiring_requests
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.requisition_jd_templates (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS headcount_plan_line_id uuid;

CREATE INDEX IF NOT EXISTS idx_hiring_requests_template_id
  ON public.hiring_requests (template_id);

-- Headcount plan read-model for finance validation.
CREATE TABLE IF NOT EXISTS public.headcount_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  plan_code text NOT NULL,
  title text NOT NULL,
  fiscal_year integer NOT NULL,
  status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('draft', 'approved', 'archived')),
  source_system text,
  source_ref text,
  synced_at timestamptz,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, plan_code, fiscal_year)
);

CREATE TABLE IF NOT EXISTS public.headcount_plan_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.headcount_plans (id) ON DELETE CASCADE,
  department text,
  role_level text,
  cost_center text,
  location_city text,
  headcount_limit integer NOT NULL DEFAULT 1,
  approved_budget_min numeric,
  approved_budget_max numeric,
  currency text NOT NULL DEFAULT 'INR',
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hiring_requests
  ADD CONSTRAINT fk_hiring_requests_headcount_plan_line
  FOREIGN KEY (headcount_plan_line_id)
  REFERENCES public.headcount_plan_lines (id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_headcount_plans_org_status
  ON public.headcount_plans (organisation_id, status, fiscal_year DESC);
CREATE INDEX IF NOT EXISTS idx_headcount_plan_lines_org_plan
  ON public.headcount_plan_lines (organisation_id, plan_id);

ALTER TABLE public.headcount_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.headcount_plan_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "headcount plans org read"
  ON public.headcount_plans
  FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'hiring_manager', 'finance', 'super_admin')
  );

CREATE POLICY "headcount plans org write"
  ON public.headcount_plans
  FOR ALL
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'finance', 'super_admin')
  )
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'finance', 'super_admin')
  );

CREATE POLICY "headcount plan lines org read"
  ON public.headcount_plan_lines
  FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'hiring_manager', 'finance', 'super_admin')
  );

CREATE POLICY "headcount plan lines org write"
  ON public.headcount_plan_lines
  FOR ALL
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'finance', 'super_admin')
  )
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'finance', 'super_admin')
  );

-- Delegation / proxy approvers by role.
CREATE TABLE IF NOT EXISTS public.approval_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  approver_role text NOT NULL,
  delegate_profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_approval_delegations_active
  ON public.approval_delegations (organisation_id, approver_role, delegate_profile_id, starts_at, ends_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.approval_delegations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approval delegations org read"
  ON public.approval_delegations
  FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'finance', 'super_admin')
  );

CREATE POLICY "approval delegations org write"
  ON public.approval_delegations
  FOR ALL
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'super_admin')
  )
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'super_admin')
  );

COMMIT;
