-- Fix: Agency users cannot read pipeline_stages for client jobs.
-- Add agency_clients join path to the SELECT policy.

DROP POLICY IF EXISTS pipeline_stages_select ON pipeline_stages;

CREATE POLICY pipeline_stages_select ON pipeline_stages
  FOR SELECT USING (
    (EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = pipeline_stages.job_id
        AND jobs.organisation_id = (SELECT auth_organisation_id())
    ))
    OR (EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = pipeline_stages.job_id
        AND jobs.hiring_manager_id = auth.uid()
    ))
    OR ((SELECT auth_role()) = 'super_admin')
    OR (
      (SELECT auth_role()) = 'agency'
      AND EXISTS (
        SELECT 1 FROM jobs j
        JOIN agency_clients ac ON ac.client_organisation_id = j.organisation_id
        WHERE j.id = pipeline_stages.job_id
          AND ac.agency_organisation_id = (SELECT auth_organisation_id())
      )
    )
  );
