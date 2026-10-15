-- Parallel approval pipeline: both recruiter and hiring manager must approve
-- a shortlisted candidate before an interview invite can be sent.

BEGIN;

CREATE TABLE shortlist_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_candidate_id uuid NOT NULL REFERENCES pipeline_candidates (id) ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES auth.users (id),
  approver_role text NOT NULL CHECK (approver_role IN ('recruiter', 'hiring_manager')),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  notes text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline_candidate_id, approver_role)
);

CREATE INDEX idx_shortlist_approvals_pipeline ON shortlist_approvals (pipeline_candidate_id);
CREATE INDEX idx_shortlist_approvals_approver ON shortlist_approvals (approver_id);

COMMENT ON TABLE shortlist_approvals IS 'One approval per role per pipeline candidate. Both recruiter + HM must approve before interview invite.';

ALTER TABLE shortlist_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read approvals for their jobs"
  ON shortlist_approvals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pipeline_candidates pc
      JOIN jobs j ON j.id = pc.job_id
      WHERE pc.id = shortlist_approvals.pipeline_candidate_id
      AND (
        j.organisation_id = public.auth_organisation_id()
        OR j.hiring_manager_id = auth.uid()
      )
    )
  );

CREATE POLICY "Recruiters can insert approvals"
  ON shortlist_approvals FOR INSERT
  WITH CHECK (
    approver_id = auth.uid()
    AND approver_role = 'recruiter'
    AND public.auth_role() IN ('recruiter', 'company_admin')
  );

CREATE POLICY "Hiring managers can insert approvals"
  ON shortlist_approvals FOR INSERT
  WITH CHECK (
    approver_id = auth.uid()
    AND approver_role = 'hiring_manager'
    AND public.auth_role() = 'hiring_manager'
  );

COMMIT;
