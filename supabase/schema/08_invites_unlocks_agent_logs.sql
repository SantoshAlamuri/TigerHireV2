-- Recruiter invites: Company Admin invites recruiter via email link.

CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  email text NOT NULL,
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  invited_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  role app_role NOT NULL DEFAULT 'recruiter',
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invites_token ON invites (token);
CREATE INDEX idx_invites_organisation_id ON invites (organisation_id);
CREATE INDEX idx_invites_email ON invites (email);

-- Candidate unlocks: which org/recruiter unlocked which candidate (quota + audit).

CREATE TABLE candidate_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  unlocked_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidate_unlocks_candidate_id ON candidate_unlocks (candidate_id);
CREATE INDEX idx_candidate_unlocks_job_id ON candidate_unlocks (job_id);
CREATE INDEX idx_candidate_unlocks_organisation_id ON candidate_unlocks (organisation_id);

-- Agent logs: for admin dashboard (Talent Scout, FitScore runs).

CREATE TABLE agent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name text NOT NULL,
  run_id text,
  status text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_logs_agent_name ON agent_logs (agent_name);
CREATE INDEX idx_agent_logs_created_at ON agent_logs (created_at DESC);
CREATE INDEX idx_agent_logs_run_id ON agent_logs (run_id) WHERE run_id IS NOT NULL;
