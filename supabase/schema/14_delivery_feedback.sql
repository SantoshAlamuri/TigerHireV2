-- Delivery feedback: client hire/rejected for FitScore retraining (DeliverFlow).
-- Used when recruiter marks a shortlisted candidate as hired or rejected.

CREATE TABLE delivery_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  outcome text NOT NULL CHECK (outcome IN ('hired', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_feedback_job_candidate_unique UNIQUE (job_id, candidate_id)
);

CREATE INDEX idx_delivery_feedback_job_id ON delivery_feedback (job_id);
CREATE INDEX idx_delivery_feedback_outcome ON delivery_feedback (outcome);

COMMENT ON TABLE delivery_feedback IS 'Client hire/reject feedback per delivered candidate for FitScore model retraining.';

ALTER TABLE delivery_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage delivery_feedback for their jobs"
  ON delivery_feedback FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = delivery_feedback.job_id
      AND jobs.organisation_id = public.auth_organisation_id()
    )
    AND public.auth_role() IN ('company_admin', 'recruiter', 'agency', 'super_admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = delivery_feedback.job_id
      AND jobs.organisation_id = public.auth_organisation_id()
    )
    AND public.auth_role() IN ('company_admin', 'recruiter', 'agency', 'super_admin')
  );
