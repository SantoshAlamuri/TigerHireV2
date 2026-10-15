-- Job distribution tracking: which boards each job was pushed to and external IDs.
CREATE TABLE job_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  board varchar(64) NOT NULL,
  external_id varchar(256),
  status varchar(32) NOT NULL DEFAULT 'pushed',
  pushed_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  error text,
  UNIQUE(job_id, board)
);

CREATE INDEX idx_job_distributions_job_id ON job_distributions(job_id);
CREATE INDEX idx_job_distributions_board ON job_distributions(board);

COMMENT ON TABLE job_distributions IS 'Tracks job pushes to external boards (e.g. Adzuna). status: pushed | removed.';
