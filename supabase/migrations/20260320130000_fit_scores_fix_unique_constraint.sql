-- Migration: Fix fit_scores unique constraint for production score upserts
--
-- Problem: Migration 20260320120000 dropped the original UNIQUE constraint
-- (job_id, candidate_id) and replaced it with a partial unique index
-- (WHERE is_test_run = false). The Supabase JS client's upsert() with
-- onConflict cannot target partial indexes, causing ALL production score
-- saves to fail silently.
--
-- Fix: Add a composite unique constraint on (job_id, candidate_id, run_index)
-- so the application code can use select+update/insert pattern reliably.
-- The partial index is kept for defense-in-depth.

-- Add composite unique constraint that works with standard conflict resolution
-- Production scores always have run_index = 1; test runs get 2, 3, 4, ...
CREATE UNIQUE INDEX IF NOT EXISTS fit_scores_job_candidate_run_unique
ON fit_scores (job_id, candidate_id, run_index);

COMMENT ON INDEX fit_scores_job_candidate_run_unique IS 'Composite unique: one score per candidate+job+run_index. Production = run_index 1, test runs increment.';

-- Backfill: ensure all existing rows have is_test_run and run_index set
UPDATE fit_scores SET is_test_run = false WHERE is_test_run IS NULL;
UPDATE fit_scores SET run_index = 1 WHERE run_index IS NULL;

-- Set NOT NULL defaults for safety
ALTER TABLE fit_scores ALTER COLUMN is_test_run SET DEFAULT false;
ALTER TABLE fit_scores ALTER COLUMN run_index SET DEFAULT 1;
