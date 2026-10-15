-- Fix jobs table schema for dev environment
-- Ensures all required columns, functions, and policies exist

BEGIN;

-- ============================================================
-- 1. Ensure job_status enum exists
-- ============================================================
DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('draft', 'open', 'closed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. Ensure auth_organisation_ids() function exists
-- This is critical for RLS policies to work
-- Uses the same implementation as schema/74_tenant_security_storage_apps.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.auth_organisation_ids()
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  my_org uuid;
  my_role public.app_role;
  client_ids uuid[];
BEGIN
  SELECT organisation_id, role INTO my_org, my_role
  FROM public.profiles WHERE id = auth.uid();
  IF my_org IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;
  IF my_role = 'agency' THEN
    BEGIN
      SELECT COALESCE(array_agg(ac.client_organisation_id), ARRAY[]::uuid[])
      INTO client_ids
      FROM public.agency_clients ac
      WHERE ac.agency_organisation_id = my_org;
      RETURN ARRAY[my_org] || COALESCE(client_ids, ARRAY[]::uuid[]);
    EXCEPTION WHEN undefined_table THEN
      RETURN ARRAY[my_org];
    END;
  END IF;
  RETURN ARRAY[my_org];
END;
$$;

-- ============================================================
-- 3. Add missing columns to jobs table (idempotent)
-- ============================================================

-- Core columns from 06_jobs.sql
-- Note: id and primary key should already exist if table exists
-- We only add columns that might be missing
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS organisation_id uuid;
-- Add foreign key constraint if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'jobs_organisation_id_fkey' AND table_name = 'jobs'
  ) THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_organisation_id_fkey 
      FOREIGN KEY (organisation_id) REFERENCES organisations (id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN OTHERS THEN NULL;
END $$;
-- Try to set NOT NULL (will fail silently if column has nulls - that's OK for dev)
DO $$ 
BEGIN
  ALTER TABLE jobs ALTER COLUMN organisation_id SET NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description text NOT NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status job_status NOT NULL DEFAULT 'open';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS compensation_min numeric(12,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS compensation_max numeric(12,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS jd_embedding vector(1536);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- From 06a_jobs_deliverflow.sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS shortlist_due_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS shortlist_delivered_at timestamptz;

-- From migrate_hiring_manager.sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS hiring_manager_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

-- From 06b_jobs_structured_sections.sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS role_function text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS seniority_level text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skills_required text[] DEFAULT '{}';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skills_preferred text[] DEFAULT '{}';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS remote_allowed boolean DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS jd_sections jsonb DEFAULT '{}';

-- From 20260318110000_jobs_show_salary.sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS show_salary boolean NOT NULL DEFAULT false;

-- From 52_job_recruiter_assignment.sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_recruiter_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

-- ============================================================
-- 4. Ensure indexes exist
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_jobs_organisation_id ON jobs (organisation_id);
CREATE INDEX IF NOT EXISTS idx_jobs_hiring_manager_id ON jobs (hiring_manager_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at DESC);

-- ============================================================
-- 5. Ensure RLS is enabled
-- ============================================================
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. Ensure RLS policies exist (drop and recreate to ensure they're correct)
-- ============================================================

-- SELECT policy
DROP POLICY IF EXISTS "jobs_select" ON jobs;
CREATE POLICY "jobs_select"
  ON jobs FOR SELECT
  USING (
    (
      status = 'open'
      AND (SELECT public.auth_role()) IN ('candidate_pro', 'candidate_free')
    )
    OR organisation_id = ANY(public.auth_organisation_ids())
    OR (
      (SELECT public.auth_role()) = 'hiring_manager'
      AND hiring_manager_id = (SELECT auth.uid())
    )
    OR (SELECT public.auth_role()) = 'super_admin'
  );

-- INSERT policy
DROP POLICY IF EXISTS "jobs_insert" ON jobs;
CREATE POLICY "jobs_insert"
  ON jobs FOR INSERT
  WITH CHECK (
    (
      organisation_id = ANY(public.auth_organisation_ids())
      AND (SELECT public.auth_role()) IN ('company_admin', 'recruiter', 'agency', 'hiring_manager')
    )
    OR (SELECT public.auth_role()) = 'super_admin'
  );

-- UPDATE policy
DROP POLICY IF EXISTS "jobs_update" ON jobs;
CREATE POLICY "jobs_update"
  ON jobs FOR UPDATE
  USING (
    (
      organisation_id = ANY(public.auth_organisation_ids())
      AND (SELECT public.auth_role()) IN ('company_admin', 'recruiter', 'agency')
    )
    OR (
      (SELECT public.auth_role()) = 'hiring_manager'
      AND hiring_manager_id = (SELECT auth.uid())
    )
    OR (SELECT public.auth_role()) = 'super_admin'
  )
  WITH CHECK (
    organisation_id = ANY(public.auth_organisation_ids())
    OR hiring_manager_id = (SELECT auth.uid())
    OR (SELECT public.auth_role()) = 'super_admin'
  );

-- DELETE policy
DROP POLICY IF EXISTS "jobs_delete" ON jobs;
CREATE POLICY "jobs_delete"
  ON jobs FOR DELETE
  USING (
    (
      organisation_id = public.auth_organisation_id()
      AND public.auth_role() IN ('company_admin', 'super_admin')
    )
    OR (
      organisation_id = ANY(public.auth_organisation_ids())
      AND public.auth_role() = 'agency'
    )
    OR (
      public.auth_role() = 'super_admin'
    )
  );

COMMIT;
