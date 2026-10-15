-- Resume version management: track multiple resume versions per candidate

CREATE TABLE resume_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  storage_path text,
  is_default boolean NOT NULL DEFAULT false,
  label text,
  uploaded_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_resume_versions_candidate ON resume_versions (candidate_id);
CREATE UNIQUE INDEX idx_resume_versions_one_default ON resume_versions (candidate_id) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_resume_versions_storage_path
  ON resume_versions (candidate_id)
  WHERE storage_path IS NOT NULL;

COMMENT ON TABLE resume_versions IS 'Multiple resume versions per candidate with one default';
COMMENT ON COLUMN resume_versions.is_default IS 'Only one resume per candidate should be default; enforce in application code';
COMMENT ON COLUMN resume_versions.storage_path IS 'Path within resumes bucket, e.g. {candidate_id}/{version_id}.pdf. Used for signed URLs.';
