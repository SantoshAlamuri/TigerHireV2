-- Unique partial index: at most one default resume per candidate (enforced at DB level)
DROP INDEX IF EXISTS idx_resume_versions_default;
CREATE UNIQUE INDEX idx_resume_versions_one_default
  ON resume_versions (candidate_id) WHERE is_default = true;

-- Atomic default resume switch: clear existing default and set new one in one transaction
CREATE OR REPLACE FUNCTION switch_default_resume(
  p_candidate_id uuid,
  p_version_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id uuid;
BEGIN
  UPDATE resume_versions
  SET is_default = false
  WHERE candidate_id = p_candidate_id AND is_default = true;

  UPDATE resume_versions
  SET is_default = true
  WHERE id = p_version_id AND candidate_id = p_candidate_id
  RETURNING id INTO v_updated_id;

  RETURN v_updated_id;
END;
$$;

COMMENT ON FUNCTION switch_default_resume(uuid, uuid) IS 'Atomically set one resume version as default for a candidate; clears previous default.';
