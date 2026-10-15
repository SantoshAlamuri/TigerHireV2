-- Add agency_stage column so agencies can track candidates through their own workflow,
-- independent of the per-job pipeline_stages (company-side).
ALTER TABLE pipeline_candidates
  ADD COLUMN IF NOT EXISTS agency_stage text DEFAULT 'interest_received';

COMMENT ON COLUMN pipeline_candidates.agency_stage
  IS 'Agency-side tracking: interest_received | shared_with_company | shortlisted | interview | final_round | offered | joined';
