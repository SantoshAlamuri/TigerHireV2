-- Migration: Add test run support to fit_scores for consistency testing
-- Purpose: Allow multiple test runs per candidate+job pair while preserving production scores
-- Enables force-rescore flag to bypass caching and test model consistency

-- Add columns for test run tracking
ALTER TABLE fit_scores 
ADD COLUMN IF NOT EXISTS is_test_run boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS run_index integer DEFAULT 1;

COMMENT ON COLUMN fit_scores.is_test_run IS 'True for test runs (force-rescore). Production scores always have is_test_run = false.';
COMMENT ON COLUMN fit_scores.run_index IS 'Increments for each test run of the same candidate+job pair. Production score = 1, test runs = 2, 3, 4, etc.';

-- Drop the existing unique constraint
ALTER TABLE fit_scores DROP CONSTRAINT IF EXISTS fit_scores_job_candidate_unique;

-- Create a partial unique constraint: only one row per (job_id, candidate_id) when is_test_run = false
-- This preserves production behavior: one score per candidate+job
-- Test runs (is_test_run = true) can have multiple rows
CREATE UNIQUE INDEX fit_scores_job_candidate_production_unique 
ON fit_scores (job_id, candidate_id) 
WHERE is_test_run = false;

-- Add index for querying test runs
CREATE INDEX IF NOT EXISTS idx_fit_scores_test_runs 
ON fit_scores (job_id, candidate_id, is_test_run, run_index);

COMMENT ON INDEX fit_scores_job_candidate_production_unique IS 'Ensures only one production score per candidate+job. Test runs can have multiple rows.';
