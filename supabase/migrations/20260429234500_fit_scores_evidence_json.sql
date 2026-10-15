-- Persist structured CV evidence quotes for hybrid verdict explanations.
ALTER TABLE fit_scores
ADD COLUMN IF NOT EXISTS evidence_json jsonb;

COMMENT ON COLUMN fit_scores.evidence_json IS
  'Hybrid v2 structured quote evidence for recruiter-facing explanations.';
