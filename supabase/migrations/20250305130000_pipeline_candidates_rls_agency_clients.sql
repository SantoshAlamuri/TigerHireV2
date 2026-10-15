-- Fix: Agency users cannot see pipeline_candidates for client jobs because
-- the existing RLS checks jobs.organisation_id = auth_organisation_id(),
-- which is the agency org, not the client org.
-- Add an agency_clients join path so agencies can access their clients' pipeline data.

-- DROP existing policies
DROP POLICY IF EXISTS pipeline_candidates_select ON pipeline_candidates;
DROP POLICY IF EXISTS pipeline_candidates_insert ON pipeline_candidates;
DROP POLICY IF EXISTS pipeline_candidates_update ON pipeline_candidates;
DROP POLICY IF EXISTS pipeline_candidates_delete ON pipeline_candidates;

-- SELECT: agency can read pipeline rows for jobs at linked client orgs
CREATE POLICY pipeline_candidates_select ON pipeline_candidates
  FOR SELECT USING (
    (EXISTS (
      SELECT 1 FROM candidates
      WHERE candidates.id = pipeline_candidates.candidate_id
        AND candidates.user_id = auth.uid()
    ))
    OR (EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = pipeline_candidates.job_id
        AND jobs.organisation_id = (SELECT auth_organisation_id())
    ))
    OR (EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = pipeline_candidates.job_id
        AND jobs.hiring_manager_id = auth.uid()
    ))
    OR ((SELECT auth_role()) = 'super_admin')
    OR (
      (SELECT auth_role()) = 'agency'
      AND EXISTS (
        SELECT 1 FROM jobs j
        JOIN agency_clients ac ON ac.client_organisation_id = j.organisation_id
        WHERE j.id = pipeline_candidates.job_id
          AND ac.agency_organisation_id = (SELECT auth_organisation_id())
      )
    )
  );

-- INSERT: agency can insert for client jobs
CREATE POLICY pipeline_candidates_insert ON pipeline_candidates
  FOR INSERT WITH CHECK (
    (
      (EXISTS (
        SELECT 1 FROM jobs
        WHERE jobs.id = pipeline_candidates.job_id
          AND jobs.organisation_id = (SELECT auth_organisation_id())
      ))
      AND ((SELECT auth_role()) = ANY (ARRAY['company_admin'::app_role, 'recruiter'::app_role, 'agency'::app_role]))
    )
    OR (
      (SELECT auth_role()) = 'agency'
      AND EXISTS (
        SELECT 1 FROM jobs j
        JOIN agency_clients ac ON ac.client_organisation_id = j.organisation_id
        WHERE j.id = pipeline_candidates.job_id
          AND ac.agency_organisation_id = (SELECT auth_organisation_id())
      )
    )
  );

-- UPDATE: agency can update for client jobs
CREATE POLICY pipeline_candidates_update ON pipeline_candidates
  FOR UPDATE
  USING (
    (
      (EXISTS (
        SELECT 1 FROM jobs
        WHERE jobs.id = pipeline_candidates.job_id
          AND jobs.organisation_id = (SELECT auth_organisation_id())
      ))
      AND ((SELECT auth_role()) = ANY (ARRAY['company_admin'::app_role, 'recruiter'::app_role, 'agency'::app_role]))
    )
    OR (
      (SELECT auth_role()) = 'agency'
      AND EXISTS (
        SELECT 1 FROM jobs j
        JOIN agency_clients ac ON ac.client_organisation_id = j.organisation_id
        WHERE j.id = pipeline_candidates.job_id
          AND ac.agency_organisation_id = (SELECT auth_organisation_id())
      )
    )
  )
  WITH CHECK (
    (EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = pipeline_candidates.job_id
        AND jobs.organisation_id = (SELECT auth_organisation_id())
    ))
    OR (
      (SELECT auth_role()) = 'agency'
      AND EXISTS (
        SELECT 1 FROM jobs j
        JOIN agency_clients ac ON ac.client_organisation_id = j.organisation_id
        WHERE j.id = pipeline_candidates.job_id
          AND ac.agency_organisation_id = (SELECT auth_organisation_id())
      )
    )
  );

-- DELETE: agency can delete for client jobs
CREATE POLICY pipeline_candidates_delete ON pipeline_candidates
  FOR DELETE USING (
    (
      (EXISTS (
        SELECT 1 FROM jobs
        WHERE jobs.id = pipeline_candidates.job_id
          AND jobs.organisation_id = (SELECT auth_organisation_id())
      ))
      AND ((SELECT auth_role()) = ANY (ARRAY['company_admin'::app_role, 'recruiter'::app_role, 'agency'::app_role]))
    )
    OR (
      (SELECT auth_role()) = 'agency'
      AND EXISTS (
        SELECT 1 FROM jobs j
        JOIN agency_clients ac ON ac.client_organisation_id = j.organisation_id
        WHERE j.id = pipeline_candidates.job_id
          AND ac.agency_organisation_id = (SELECT auth_organisation_id())
      )
    )
  );
