-- Migration: add hiring_manager role and jobs.hiring_manager_id
-- Run this in Supabase Dashboard → SQL Editor if your DB was created before these were in the schema.
-- Fixes 500 on GET/POST /api/jobs when the app uses hiring_manager or hiring_manager_id.

-- 1. Add hiring_manager to app_role enum
-- (If you get "already exists", skip this line or comment it out.)
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'hiring_manager';

-- 2. Add column and index to jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS hiring_manager_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_hiring_manager_id ON jobs (hiring_manager_id);

-- 3. RLS: hiring managers can read their assigned jobs
DROP POLICY IF EXISTS "Hiring managers can read their assigned jobs" ON jobs;
CREATE POLICY "Hiring managers can read their assigned jobs"
  ON jobs FOR SELECT
  USING (
    public.auth_role() = 'hiring_manager'
    AND hiring_manager_id = auth.uid()
  );

-- 4. RLS: hiring managers can create jobs (same org)
DROP POLICY IF EXISTS "Hiring managers can create jobs" ON jobs;
CREATE POLICY "Hiring managers can create jobs"
  ON jobs FOR INSERT
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() = 'hiring_manager'
  );

-- 5. RLS: hiring managers can update their assigned jobs
DROP POLICY IF EXISTS "Hiring managers can update their assigned jobs" ON jobs;
CREATE POLICY "Hiring managers can update their assigned jobs"
  ON jobs FOR UPDATE
  USING (
    public.auth_role() = 'hiring_manager'
    AND hiring_manager_id = auth.uid()
  )
  WITH CHECK (hiring_manager_id = auth.uid());
