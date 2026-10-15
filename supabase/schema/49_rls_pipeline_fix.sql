-- P0-1: Enable RLS on pipeline_stages and pipeline_candidates.
-- These two tables were exposed through PostgREST without row-level restrictions.

BEGIN;

-- ============================================================
-- Enable RLS
-- ============================================================

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_candidates ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PIPELINE_STAGES policies
-- ============================================================

CREATE POLICY "Org members can read stages for their org jobs"
  ON pipeline_stages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = pipeline_stages.job_id
      AND jobs.organisation_id = public.auth_organisation_id()
    )
  );

CREATE POLICY "Hiring managers can read stages for assigned jobs"
  ON pipeline_stages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = pipeline_stages.job_id
      AND jobs.hiring_manager_id = auth.uid()
    )
  );

CREATE POLICY "Org hiring roles can create stages"
  ON pipeline_stages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = pipeline_stages.job_id
      AND jobs.organisation_id = public.auth_organisation_id()
    )
    AND public.auth_role() IN ('company_admin', 'recruiter', 'agency')
  );

CREATE POLICY "Org hiring roles can update stages"
  ON pipeline_stages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = pipeline_stages.job_id
      AND jobs.organisation_id = public.auth_organisation_id()
    )
    AND public.auth_role() IN ('company_admin', 'recruiter', 'agency')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = pipeline_stages.job_id
      AND jobs.organisation_id = public.auth_organisation_id()
    )
  );

CREATE POLICY "Org hiring roles can delete stages"
  ON pipeline_stages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = pipeline_stages.job_id
      AND jobs.organisation_id = public.auth_organisation_id()
    )
    AND public.auth_role() IN ('company_admin', 'recruiter', 'agency')
  );

CREATE POLICY "Super admins can read all pipeline stages"
  ON pipeline_stages FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- ============================================================
-- PIPELINE_CANDIDATES policies
-- ============================================================

CREATE POLICY "Org members can read pipeline candidates for their jobs"
  ON pipeline_candidates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = pipeline_candidates.job_id
      AND jobs.organisation_id = public.auth_organisation_id()
    )
  );

CREATE POLICY "Hiring managers can read pipeline candidates for assigned jobs"
  ON pipeline_candidates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = pipeline_candidates.job_id
      AND jobs.hiring_manager_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can read own pipeline entries"
  ON pipeline_candidates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM candidates
      WHERE candidates.id = pipeline_candidates.candidate_id
      AND candidates.user_id = auth.uid()
    )
  );

CREATE POLICY "Org hiring roles can manage pipeline candidates"
  ON pipeline_candidates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = pipeline_candidates.job_id
      AND jobs.organisation_id = public.auth_organisation_id()
    )
    AND public.auth_role() IN ('company_admin', 'recruiter', 'agency')
  );

CREATE POLICY "Org hiring roles can update pipeline candidates"
  ON pipeline_candidates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = pipeline_candidates.job_id
      AND jobs.organisation_id = public.auth_organisation_id()
    )
    AND public.auth_role() IN ('company_admin', 'recruiter', 'agency')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = pipeline_candidates.job_id
      AND jobs.organisation_id = public.auth_organisation_id()
    )
  );

CREATE POLICY "Org hiring roles can delete pipeline candidates"
  ON pipeline_candidates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = pipeline_candidates.job_id
      AND jobs.organisation_id = public.auth_organisation_id()
    )
    AND public.auth_role() IN ('company_admin', 'recruiter', 'agency')
  );

CREATE POLICY "Super admins can read all pipeline candidates"
  ON pipeline_candidates FOR SELECT
  USING (public.auth_role() = 'super_admin');

COMMIT;
