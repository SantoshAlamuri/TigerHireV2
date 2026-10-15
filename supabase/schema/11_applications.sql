-- TigerHire - Applications table
-- Enables two-way marketplace: candidates can express interest in jobs.

BEGIN;

CREATE TYPE application_status AS ENUM ('applied', 'viewed', 'shortlisted', 'rejected', 'hired', 'withdrawn');
CREATE TYPE interest_level AS ENUM ('interested', 'strong_interest');

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  fit_score_id uuid REFERENCES fit_scores (id) ON DELETE SET NULL,
  interest interest_level NOT NULL DEFAULT 'interested',
  cover_note text,
  status application_status NOT NULL DEFAULT 'applied',
  viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applications_candidate_job_unique UNIQUE (candidate_id, job_id)
);

CREATE INDEX idx_applications_candidate_id ON applications (candidate_id);
CREATE INDEX idx_applications_job_id ON applications (job_id);
CREATE INDEX idx_applications_status ON applications (status);
CREATE INDEX idx_applications_created_at ON applications (created_at DESC);

COMMENT ON TABLE applications IS 'Candidate applications to jobs. Links to fit_scores for recruiter context.';

-- RLS
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Candidates can read own applications"
  ON applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM candidates
      WHERE candidates.id = applications.candidate_id
      AND candidates.user_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can create applications"
  ON applications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM candidates
      WHERE candidates.id = applications.candidate_id
      AND candidates.user_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can update own applications"
  ON applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM candidates
      WHERE candidates.id = applications.candidate_id
      AND candidates.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM candidates
      WHERE candidates.id = applications.candidate_id
      AND candidates.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can read applications for their jobs"
  ON applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = applications.job_id
      AND jobs.organisation_id = public.auth_organisation_id()
    )
  );

CREATE POLICY "Org hiring roles can update applications for their jobs"
  ON applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = applications.job_id
      AND jobs.organisation_id = public.auth_organisation_id()
    )
    AND public.auth_role() IN ('company_admin', 'recruiter', 'agency')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = applications.job_id
      AND jobs.organisation_id = public.auth_organisation_id()
    )
    AND public.auth_role() IN ('company_admin', 'recruiter', 'agency')
  );

CREATE POLICY "Super admins can read all applications"
  ON applications FOR SELECT
  USING (public.auth_role() = 'super_admin');

COMMIT;
