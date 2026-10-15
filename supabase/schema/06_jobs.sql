-- Jobs: job descriptions posted by organisations. FitScore runs against these.
-- DeliverFlow: shortlist_due_at = 72h SLA; shortlist_delivered_at when client sees shortlist.

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  hiring_manager_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL,
  location text,
  status job_status NOT NULL DEFAULT 'open',
  compensation_min numeric(12,2),
  compensation_max numeric(12,2),
  jd_embedding vector(1536),
  shortlist_due_at timestamptz,
  shortlist_delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_organisation_id ON jobs (organisation_id);
CREATE INDEX idx_jobs_hiring_manager_id ON jobs (hiring_manager_id);
CREATE INDEX idx_jobs_status ON jobs (status);
CREATE INDEX idx_jobs_created_at ON jobs (created_at DESC);
CREATE INDEX idx_jobs_jd_embedding ON jobs USING ivfflat (jd_embedding vector_cosine_ops) WITH (lists = 100);

COMMENT ON TABLE jobs IS 'Job descriptions. jd_embedding for similarity (e.g. OpenAI 1536).';
