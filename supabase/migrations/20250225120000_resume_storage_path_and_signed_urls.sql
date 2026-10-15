-- Resume bucket: add storage_path for signed URL generation and RLS-aligned paths.
-- Path convention: object name = {candidate_id}/{unique_id}.{ext} (no "resumes/" prefix).

ALTER TABLE resume_versions
  ADD COLUMN IF NOT EXISTS storage_path text;

COMMENT ON COLUMN resume_versions.storage_path IS 'Path within resumes bucket, e.g. {candidate_id}/{version_id}.pdf. Used for signed URLs.';

CREATE INDEX IF NOT EXISTS idx_resume_versions_storage_path
  ON resume_versions (candidate_id)
  WHERE storage_path IS NOT NULL;
