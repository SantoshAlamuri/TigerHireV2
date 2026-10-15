-- Recruiter-to-job assignment: allows explicit assignment of a recruiter to a job.

BEGIN;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_recruiter_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_assigned_recruiter_id ON jobs (assigned_recruiter_id) WHERE assigned_recruiter_id IS NOT NULL;

COMMENT ON COLUMN jobs.assigned_recruiter_id IS 'Explicitly assigned recruiter for this job. NULL = unassigned (visible to all org recruiters).';

COMMIT;
