-- Lightweight ATS: pipeline stages per job, candidates in pipeline (Scheduler Agent).

CREATE TABLE pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  stage_name text NOT NULL,
  stage_order integer NOT NULL,
  interviewer_email text,
  interviewer_name text
);

CREATE TABLE pipeline_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  stage_id uuid REFERENCES pipeline_stages (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'shortlisted',
  unlocked boolean DEFAULT false,
  unlocked_at timestamptz,
  interview_scheduled_at timestamptz,
  interview_outcome text,
  recruiter_rating smallint CHECK (recruiter_rating >= 1 AND recruiter_rating <= 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pipeline_stages_job_id ON pipeline_stages (job_id);
CREATE INDEX idx_pipeline_candidates_job_id ON pipeline_candidates (job_id);
CREATE INDEX idx_pipeline_candidates_candidate_id ON pipeline_candidates (candidate_id);
CREATE INDEX idx_pipeline_candidates_interview_scheduled ON pipeline_candidates (interview_scheduled_at) WHERE interview_scheduled_at IS NOT NULL;

COMMENT ON TABLE pipeline_stages IS 'Recruiter-defined stages; Scheduler uses interviewer_email for invites';
COMMENT ON TABLE pipeline_candidates IS 'status: shortlisted | in_progress | hired | rejected; interview_outcome: showed | no_show | progressed | rejected';
