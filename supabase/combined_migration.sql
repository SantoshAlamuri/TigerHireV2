-- TigerHire - Combined Migration Script
-- Run this in Supabase SQL Editor
-- This combines all schema files (00-09) in the correct order.

BEGIN;

-- ============================================================
-- 00: Extensions and Enums
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TYPE app_role AS ENUM (
  'super_admin',
  'company_admin',
  'recruiter',
  'hiring_manager',
  'agency',
  'candidate_pro',
  'candidate_free'
);

CREATE TYPE organisation_type AS ENUM ('company', 'agency');
CREATE TYPE organisation_approval AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE job_status AS ENUM ('draft', 'open', 'closed');
CREATE TYPE signal_source AS ENUM ('naukri', 'indeed', 'linkedin', 'manual', 'other');
CREATE TYPE company_plan AS ENUM ('starter', 'growth', 'scale');
CREATE TYPE candidate_plan AS ENUM ('free', 'pro');

-- ============================================================
-- 01: Organisations
-- ============================================================

CREATE TABLE organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type organisation_type NOT NULL,
  name text NOT NULL,
  slug text,
  approval organisation_approval NOT NULL DEFAULT 'approved',
  company_plan company_plan NOT NULL DEFAULT 'starter',
  stripe_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organisations_slug_unique UNIQUE (slug)
);

CREATE INDEX idx_organisations_type ON organisations (type);
CREATE INDEX idx_organisations_approval ON organisations (approval) WHERE approval = 'pending';
CREATE INDEX idx_organisations_slug ON organisations (slug) WHERE slug IS NOT NULL;

COMMENT ON TABLE organisations IS 'Companies (hire) and agencies (RPO; multiple clients). Agency approval required before access.';

-- ============================================================
-- 02: Profiles
-- ============================================================

CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role app_role NOT NULL,
  organisation_id uuid REFERENCES organisations (id) ON DELETE SET NULL,
  full_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_organisation_id ON profiles (organisation_id);
CREATE INDEX idx_profiles_role ON profiles (role);

COMMENT ON TABLE profiles IS 'App user profile: role + org. id matches auth.users(id).';

-- ============================================================
-- 03: Waitlist and Contact
-- ============================================================

CREATE TABLE waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  type text NOT NULL CHECK (type IN ('company', 'candidate')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_waitlist_created_at ON waitlist (created_at DESC);
CREATE INDEX idx_waitlist_type ON waitlist (type);

CREATE TABLE contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text NOT NULL,
  company text,
  message text NOT NULL,
  type text NOT NULL CHECK (type IN ('company', 'candidate', 'press', 'partner', 'other')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contact_submissions_created_at ON contact_submissions (created_at DESC);

-- ============================================================
-- 04: Signals
-- ============================================================

CREATE TABLE signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source signal_source NOT NULL,
  external_id text NOT NULL,
  raw_data jsonb,
  candidate_id uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signals_source_external_unique UNIQUE (source, external_id)
);

CREATE INDEX idx_signals_candidate_id ON signals (candidate_id);
CREATE INDEX idx_signals_processed_at ON signals (processed_at) WHERE processed_at IS NOT NULL;
CREATE INDEX idx_signals_created_at ON signals (created_at DESC);

COMMENT ON TABLE signals IS 'Raw candidate signals from scrapers; linked to candidates after enrichment.';

-- ============================================================
-- 05: Candidates
-- ============================================================

CREATE TABLE candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  name text,
  email text,
  phone text,
  resume_url text,
  skills text[],
  experience_years numeric(4,1),
  location text,
  intent_score smallint CHECK (intent_score >= 0 AND intent_score <= 100),
  profile_embedding vector(1536),
  visibility boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidates_user_id ON candidates (user_id);
CREATE INDEX idx_candidates_visibility ON candidates (visibility) WHERE visibility = true;
CREATE INDEX idx_candidates_skills ON candidates USING GIN (skills);
CREATE INDEX idx_candidates_location ON candidates (location) WHERE location IS NOT NULL;
CREATE INDEX idx_candidates_intent_score ON candidates (intent_score DESC) WHERE intent_score IS NOT NULL;
CREATE INDEX idx_candidates_profile_embedding ON candidates USING ivfflat (profile_embedding vector_cosine_ops) WITH (lists = 100);

COMMENT ON TABLE candidates IS 'Enriched candidate profiles. user_id set when profile is claimed. profile_embedding for similarity (e.g. OpenAI 1536).';

ALTER TABLE signals
  ADD CONSTRAINT signals_candidate_id_fkey
  FOREIGN KEY (candidate_id) REFERENCES candidates (id) ON DELETE SET NULL;

-- ============================================================
-- 06: Jobs
-- ============================================================

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  hiring_manager_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL,
  location text,
  status job_status NOT NULL DEFAULT 'open',
  compensation_min numeric(12,2),
  compensation_max numeric(12,2),
  jd_embedding vector(1536),
  shortlist_due_at timestamptz,
  shortlist_delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_organisation_id ON jobs (organisation_id);
CREATE INDEX idx_jobs_hiring_manager_id ON jobs (hiring_manager_id);
CREATE INDEX idx_jobs_status ON jobs (status);
CREATE INDEX idx_jobs_created_at ON jobs (created_at DESC);
CREATE INDEX idx_jobs_jd_embedding ON jobs USING ivfflat (jd_embedding vector_cosine_ops) WITH (lists = 100);

COMMENT ON TABLE jobs IS 'Job descriptions. jd_embedding for similarity (e.g. OpenAI 1536).';

-- ============================================================
-- 07: Fit Scores
-- ============================================================

CREATE TABLE fit_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  overall_score smallint NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  skills_score smallint CHECK (skills_score >= 0 AND skills_score <= 100),
  experience_score smallint CHECK (experience_score >= 0 AND experience_score <= 100),
  dimensions jsonb,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fit_scores_job_candidate_unique UNIQUE (job_id, candidate_id)
);

CREATE INDEX idx_fit_scores_job_id ON fit_scores (job_id);
CREATE INDEX idx_fit_scores_candidate_id ON fit_scores (candidate_id);
CREATE INDEX idx_fit_scores_overall_score ON fit_scores (job_id, overall_score DESC);

COMMENT ON TABLE fit_scores IS 'FitScore per job-candidate pair. dimensions: full breakdown (v2); summary: plain-English for recruiter.';

-- ============================================================
-- 08: Invites, Unlocks, Agent Logs
-- ============================================================

CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  email text NOT NULL,
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  invited_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  role app_role NOT NULL DEFAULT 'recruiter',
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invites_token ON invites (token);
CREATE INDEX idx_invites_organisation_id ON invites (organisation_id);
CREATE INDEX idx_invites_email ON invites (email);

CREATE TABLE candidate_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  unlocked_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidate_unlocks_candidate_id ON candidate_unlocks (candidate_id);
CREATE INDEX idx_candidate_unlocks_job_id ON candidate_unlocks (job_id);
CREATE INDEX idx_candidate_unlocks_organisation_id ON candidate_unlocks (organisation_id);

CREATE TABLE agent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name text NOT NULL,
  run_id text,
  status text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_logs_agent_name ON agent_logs (agent_name);
CREATE INDEX idx_agent_logs_created_at ON agent_logs (created_at DESC);
CREATE INDEX idx_agent_logs_run_id ON agent_logs (run_id) WHERE run_id IS NOT NULL;

-- ============================================================
-- 09: Subscriptions
-- ============================================================

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES organisations (id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  stripe_subscription_id text,
  stripe_customer_id text,
  company_plan company_plan,
  candidate_plan candidate_plan,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_org_or_user CHECK (
    (organisation_id IS NOT NULL AND user_id IS NULL) OR
    (organisation_id IS NULL AND user_id IS NOT NULL)
  )
);

CREATE INDEX idx_subscriptions_organisation_id ON subscriptions (organisation_id);
CREATE INDEX idx_subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON TABLE subscriptions IS 'Company plan (org) or candidate Pro plan (user). One of organisation_id or user_id set.';

-- ============================================================
-- 10: Row Level Security
-- ============================================================

-- Helper functions (SECURITY DEFINER bypasses RLS)

CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.auth_organisation_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organisation_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Enable RLS on all tables

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fit_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- PROFILES

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Super admins can read all profiles"
  ON profiles FOR SELECT
  USING (public.auth_role() = 'super_admin');

CREATE POLICY "Org members can read profiles in same org"
  ON profiles FOR SELECT
  USING (
    organisation_id IS NOT NULL
    AND organisation_id = public.auth_organisation_id()
  );

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ORGANISATIONS

CREATE POLICY "organisations_select"
  ON organisations FOR SELECT
  USING (
    id = ANY(public.auth_organisation_ids())
    OR (SELECT public.auth_role()) = 'super_admin'
  );

CREATE POLICY "Company admins can update own organisation"
  ON organisations FOR UPDATE
  USING (
    id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'agency')
  )
  WITH CHECK (
    id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'agency')
  );

CREATE POLICY "Super admins can update any organisation"
  ON organisations FOR UPDATE
  USING (public.auth_role() = 'super_admin');

-- WAITLIST

CREATE POLICY "Super admins can read waitlist"
  ON waitlist FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- CONTACT_SUBMISSIONS

CREATE POLICY "Super admins can read contact submissions"
  ON contact_submissions FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- SIGNALS

CREATE POLICY "Super admins can read all signals"
  ON signals FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- CANDIDATES

CREATE POLICY "Recruiters can read visible candidates"
  ON candidates FOR SELECT
  USING (
    visibility = true
    AND public.auth_role() IN ('super_admin', 'company_admin', 'recruiter', 'agency')
  );

CREATE POLICY "Super admins can read all candidates"
  ON candidates FOR SELECT
  USING (public.auth_role() = 'super_admin');

CREATE POLICY "Candidates can read own profile"
  ON candidates FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Candidates can update own profile"
  ON candidates FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- JOBS

CREATE POLICY "Authenticated users can read open jobs"
  ON jobs FOR SELECT
  USING (
    status = 'open'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Org members can read all their org jobs"
  ON jobs FOR SELECT
  USING (organisation_id = public.auth_organisation_id());

CREATE POLICY "Hiring managers can read their assigned jobs"
  ON jobs FOR SELECT
  USING (
    public.auth_role() = 'hiring_manager'
    AND hiring_manager_id = auth.uid()
  );

CREATE POLICY "Super admins can read all jobs"
  ON jobs FOR SELECT
  USING (public.auth_role() = 'super_admin');

CREATE POLICY "Org hiring roles can create jobs"
  ON jobs FOR INSERT
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'agency', 'hiring_manager')
  );

CREATE POLICY "Org hiring roles can update own org jobs"
  ON jobs FOR UPDATE
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'agency')
  )
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
  );

CREATE POLICY "Hiring managers can update their assigned jobs"
  ON jobs FOR UPDATE
  USING (
    public.auth_role() = 'hiring_manager'
    AND hiring_manager_id = auth.uid()
  )
  WITH CHECK (hiring_manager_id = auth.uid());

CREATE POLICY "Company admins can delete own org jobs"
  ON jobs FOR DELETE
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'super_admin')
  );

-- FIT_SCORES

CREATE POLICY "Org members can read scores for their jobs"
  ON fit_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = fit_scores.job_id
      AND jobs.organisation_id = public.auth_organisation_id()
    )
  );

CREATE POLICY "Candidates can read own fit scores"
  ON fit_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM candidates
      WHERE candidates.id = fit_scores.candidate_id
      AND candidates.user_id = auth.uid()
    )
  );

CREATE POLICY "Super admins can read all fit scores"
  ON fit_scores FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- INVITES

CREATE POLICY "Org admins can read their invites"
  ON invites FOR SELECT
  USING (organisation_id = public.auth_organisation_id());

CREATE POLICY "Super admins can read all invites"
  ON invites FOR SELECT
  USING (public.auth_role() = 'super_admin');

CREATE POLICY "Company admins can create invites"
  ON invites FOR INSERT
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'agency')
  );

CREATE POLICY "Company admins can update own org invites"
  ON invites FOR UPDATE
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'agency')
  );

-- CANDIDATE_UNLOCKS

CREATE POLICY "Org members can read their org unlocks"
  ON candidate_unlocks FOR SELECT
  USING (organisation_id = public.auth_organisation_id());

CREATE POLICY "Super admins can read all unlocks"
  ON candidate_unlocks FOR SELECT
  USING (public.auth_role() = 'super_admin');

CREATE POLICY "Hiring roles can create unlocks for their org"
  ON candidate_unlocks FOR INSERT
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'agency')
  );

-- AGENT_LOGS

CREATE POLICY "Super admins can read agent logs"
  ON agent_logs FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- SUBSCRIPTIONS

CREATE POLICY "Users can read own org subscription"
  ON subscriptions FOR SELECT
  USING (organisation_id = public.auth_organisation_id());

CREATE POLICY "Users can read own user subscription"
  ON subscriptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Super admins can read all subscriptions"
  ON subscriptions FOR SELECT
  USING (public.auth_role() = 'super_admin');

COMMIT;

-- ============================================================
-- 52: Recruiter-to-job assignment
-- ============================================================

BEGIN;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_recruiter_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_recruiter_id ON jobs (assigned_recruiter_id) WHERE assigned_recruiter_id IS NOT NULL;

COMMIT;

-- ============================================================
-- 53: Orchestrator Agent tables
-- ============================================================

BEGIN;

CREATE TABLE orchestrator_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'paused', 'completed', 'failed', 'cancelled')),
  current_step text NOT NULL DEFAULT 'source_and_score',
  config jsonb NOT NULL DEFAULT '{}',
  context jsonb NOT NULL DEFAULT '{}',
  started_by uuid REFERENCES auth.users (id),
  paused_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orchestrator_runs_job_id ON orchestrator_runs (job_id);
CREATE INDEX idx_orchestrator_runs_status ON orchestrator_runs (status) WHERE status IN ('running', 'paused');

CREATE TABLE orchestrator_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES orchestrator_runs (id) ON DELETE CASCADE,
  step_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'awaiting_approval', 'skipped')),
  input jsonb DEFAULT '{}',
  output jsonb DEFAULT '{}',
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orchestrator_steps_run_id ON orchestrator_steps (run_id);
CREATE INDEX idx_orchestrator_steps_status ON orchestrator_steps (run_id, status) WHERE status IN ('running', 'awaiting_approval');

ALTER TABLE orchestrator_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestrator_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read orchestrator runs"
  ON orchestrator_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = orchestrator_runs.job_id
      AND (jobs.organisation_id = public.auth_organisation_id() OR public.auth_role() = 'super_admin')
    )
  );

CREATE POLICY "Recruiters can start orchestrator runs"
  ON orchestrator_runs FOR INSERT
  WITH CHECK (
    public.auth_role() IN ('company_admin', 'recruiter', 'agency', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = orchestrator_runs.job_id
      AND (jobs.organisation_id = public.auth_organisation_id() OR public.auth_role() = 'super_admin')
    )
    AND started_by = auth.uid()
  );

CREATE POLICY "Recruiters can update orchestrator runs"
  ON orchestrator_runs FOR UPDATE
  USING (
    public.auth_role() IN ('company_admin', 'recruiter', 'agency', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = orchestrator_runs.job_id
      AND (jobs.organisation_id = public.auth_organisation_id() OR public.auth_role() = 'super_admin')
    )
  );

CREATE POLICY "Org members can read orchestrator steps"
  ON orchestrator_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orchestrator_runs r
      JOIN jobs j ON j.id = r.job_id
      WHERE r.id = orchestrator_steps.run_id
      AND (j.organisation_id = public.auth_organisation_id() OR public.auth_role() = 'super_admin')
    )
  );

CREATE POLICY "System can insert orchestrator steps"
  ON orchestrator_steps FOR INSERT
  WITH CHECK (
    public.auth_role() IN ('company_admin', 'recruiter', 'agency', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM orchestrator_runs r
      JOIN jobs j ON j.id = r.job_id
      WHERE r.id = orchestrator_steps.run_id
      AND (j.organisation_id = public.auth_organisation_id() OR public.auth_role() = 'super_admin')
    )
  );

CREATE POLICY "System can update orchestrator steps"
  ON orchestrator_steps FOR UPDATE
  USING (
    public.auth_role() IN ('company_admin', 'recruiter', 'agency', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM orchestrator_runs r
      JOIN jobs j ON j.id = r.job_id
      WHERE r.id = orchestrator_steps.run_id
      AND (j.organisation_id = public.auth_organisation_id() OR public.auth_role() = 'super_admin')
    )
  );

COMMIT;
