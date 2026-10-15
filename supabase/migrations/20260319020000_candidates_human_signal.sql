-- Add human_signal column to candidates for Proof of Human Phase 1.
-- Stores AI-generation detection result: likely_authentic | review_carefully | likely_ai_generated

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS human_signal text CHECK (human_signal IN ('likely_authentic', 'review_carefully', 'likely_ai_generated')),
  ADD COLUMN IF NOT EXISTS human_signal_confidence numeric(3, 2) CHECK (human_signal_confidence >= 0 AND human_signal_confidence <= 1),
  ADD COLUMN IF NOT EXISTS human_signal_reasons text[];

COMMENT ON COLUMN candidates.human_signal IS 'AI-generation detection result from CV/cover letter analysis (Proof of Human Phase 1)';
COMMENT ON COLUMN candidates.human_signal_confidence IS 'Confidence score 0-1 for the human signal detection';
COMMENT ON COLUMN candidates.human_signal_reasons IS 'Array of reasons explaining the signal (e.g., "Uniform sentence structure", "Lacks specific personal details")';

CREATE INDEX IF NOT EXISTS idx_candidates_human_signal ON candidates (human_signal) WHERE human_signal IS NOT NULL;
