-- Orchestrator Agent: stateful recruiting pipeline automation per job.
-- Runs execute a sequence of steps (source, shortlist, outreach, schedule, feedback, decision, notify).
-- Steps auto-execute or pause at checkpoints for recruiter approval.

BEGIN;

CREATE TABLE orchestrator_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'paused', 'completed', 'failed', 'cancelled')),
  current_step text NOT NULL DEFAULT 'source_and_score',
  config jsonb NOT NULL DEFAULT '{}',
  context jsonb NOT NULL DEFAULT '{}',
  started_by uuid REFERENCES auth.users (id),
  paused_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orchestrator_runs_job_id ON orchestrator_runs (job_id);
CREATE INDEX idx_orchestrator_runs_status ON orchestrator_runs (status) WHERE status IN ('running', 'paused');

COMMENT ON TABLE orchestrator_runs IS 'Orchestrator pipeline runs per job. status: running | paused | completed | failed | cancelled.';

CREATE TABLE orchestrator_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES orchestrator_runs (id) ON DELETE CASCADE,
  step_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'awaiting_approval', 'skipped')),
  input jsonb DEFAULT '{}',
  output jsonb DEFAULT '{}',
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orchestrator_steps_run_id ON orchestrator_steps (run_id);
CREATE INDEX idx_orchestrator_steps_status ON orchestrator_steps (run_id, status) WHERE status IN ('running', 'awaiting_approval');

COMMENT ON TABLE orchestrator_steps IS 'Individual step executions within an orchestrator run.';

-- RLS
ALTER TABLE orchestrator_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestrator_steps ENABLE ROW LEVEL SECURITY;

-- Org hiring roles can read orchestrator runs for their org's jobs
CREATE POLICY "Org members can read orchestrator runs"
  ON orchestrator_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = orchestrator_runs.job_id
      AND (jobs.organisation_id = public.auth_organisation_id() OR public.auth_role() = 'super_admin')
    )
  );

CREATE POLICY "Recruiters can start orchestrator runs"
  ON orchestrator_runs FOR INSERT
  WITH CHECK (
    public.auth_role() IN ('company_admin', 'recruiter', 'agency', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = orchestrator_runs.job_id
      AND (jobs.organisation_id = public.auth_organisation_id() OR public.auth_role() = 'super_admin')
    )
    AND started_by = auth.uid()
  );

CREATE POLICY "Recruiters can update orchestrator runs"
  ON orchestrator_runs FOR UPDATE
  USING (
    public.auth_role() IN ('company_admin', 'recruiter', 'agency', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = orchestrator_runs.job_id
      AND (jobs.organisation_id = public.auth_organisation_id() OR public.auth_role() = 'super_admin')
    )
  );

-- Steps inherit access from their parent run
CREATE POLICY "Org members can read orchestrator steps"
  ON orchestrator_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orchestrator_runs r
      JOIN jobs j ON j.id = r.job_id
      WHERE r.id = orchestrator_steps.run_id
      AND (j.organisation_id = public.auth_organisation_id() OR public.auth_role() = 'super_admin')
    )
  );

CREATE POLICY "System can insert orchestrator steps"
  ON orchestrator_steps FOR INSERT
  WITH CHECK (
    public.auth_role() IN ('company_admin', 'recruiter', 'agency', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM orchestrator_runs r
      JOIN jobs j ON j.id = r.job_id
      WHERE r.id = orchestrator_steps.run_id
      AND (j.organisation_id = public.auth_organisation_id() OR public.auth_role() = 'super_admin')
    )
  );

CREATE POLICY "System can update orchestrator steps"
  ON orchestrator_steps FOR UPDATE
  USING (
    public.auth_role() IN ('company_admin', 'recruiter', 'agency', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM orchestrator_runs r
      JOIN jobs j ON j.id = r.job_id
      WHERE r.id = orchestrator_steps.run_id
      AND (j.organisation_id = public.auth_organisation_id() OR public.auth_role() = 'super_admin')
    )
  );

COMMIT;
