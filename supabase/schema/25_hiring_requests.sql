-- Hiring Requests: lightweight asks from hiring managers before a full JD is created.

BEGIN;

CREATE TABLE hiring_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  title text NOT NULL,
  department text,
  headcount integer NOT NULL DEFAULT 1,
  urgency text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'critical')),
  description text,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'converted', 'rejected')),
  assigned_job_id uuid REFERENCES jobs (id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hiring_requests_org ON hiring_requests (organisation_id);
CREATE INDEX idx_hiring_requests_created_by ON hiring_requests (created_by);
CREATE INDEX idx_hiring_requests_status ON hiring_requests (status);

COMMENT ON TABLE hiring_requests IS 'Hiring manager requests. status: pending | approved | converted | rejected. urgency: low | normal | high | critical.';

ALTER TABLE hiring_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HM can read own hiring requests"
  ON hiring_requests FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "Org recruiters and admins can read all org requests"
  ON hiring_requests FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('recruiter', 'company_admin', 'super_admin')
  );

CREATE POLICY "HM can create hiring requests"
  ON hiring_requests FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND organisation_id = public.auth_organisation_id()
    AND public.auth_role() = 'hiring_manager'
  );

CREATE POLICY "HM can update own pending requests"
  ON hiring_requests FOR UPDATE
  USING (
    created_by = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Recruiters and admins can update org requests"
  ON hiring_requests FOR UPDATE
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('recruiter', 'company_admin', 'super_admin')
  )
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
  );

COMMIT;
