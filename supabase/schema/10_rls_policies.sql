-- TigerHire - Row Level Security policies
-- Run AFTER the schema migration (00-09).
-- Relies on auth.uid() from Supabase Auth.

BEGIN;

-- ============================================================
-- Helper functions (SECURITY DEFINER bypasses RLS)
-- ============================================================

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

-- ============================================================
-- Enable RLS on all tables
-- ============================================================

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

-- ============================================================
-- PROFILES
-- ============================================================

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

-- INSERT handled by service role (registration flow uses admin client)

-- ============================================================
-- ORGANISATIONS
-- ============================================================

-- Uses auth_organisation_ids() (plural) so agencies can also see client orgs
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

-- INSERT handled by service role (registration flow)

-- ============================================================
-- WAITLIST
-- (All access via admin client - strict RLS)
-- ============================================================

CREATE POLICY "Super admins can read waitlist"
  ON waitlist FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- INSERT/UPDATE via service role only (admin client in API route)

-- ============================================================
-- CONTACT_SUBMISSIONS
-- (All access via admin client - strict RLS)
-- ============================================================

CREATE POLICY "Super admins can read contact submissions"
  ON contact_submissions FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- INSERT via service role only

-- ============================================================
-- SIGNALS
-- ============================================================

CREATE POLICY "Super admins can read all signals"
  ON signals FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- INSERT/UPDATE via service role only (agent pipelines)

-- ============================================================
-- CANDIDATES
-- ============================================================

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

-- INSERT/bulk UPDATE via service role only (Talent Scout agent)

-- ============================================================
-- JOBS
-- ============================================================

-- Only candidates can browse all open jobs; other roles need org membership.
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

CREATE POLICY "jobs_insert"
  ON jobs FOR INSERT
  WITH CHECK (
    (
      organisation_id = ANY(public.auth_organisation_ids())
      AND (SELECT public.auth_role()) IN ('company_admin', 'recruiter', 'agency', 'hiring_manager')
    )
    OR (SELECT public.auth_role()) = 'super_admin'
  );

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

-- ============================================================
-- FIT_SCORES
-- ============================================================

CREATE POLICY "Org members can read scores for their jobs"
  ON fit_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = fit_scores.job_id
      AND jobs.organisation_id = ANY(public.auth_organisation_ids())
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

-- INSERT via service role only (FitScore agent)

-- ============================================================
-- INVITES
-- ============================================================

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

-- ============================================================
-- CANDIDATE_UNLOCKS
-- ============================================================

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

-- ============================================================
-- AGENT_LOGS
-- (Admin-only read; inserts via service role)
-- ============================================================

CREATE POLICY "Super admins can read agent logs"
  ON agent_logs FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- INSERT via service role only

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================

CREATE POLICY "Users can read own org subscription"
  ON subscriptions FOR SELECT
  USING (organisation_id = public.auth_organisation_id());

CREATE POLICY "Users can read own user subscription"
  ON subscriptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Super admins can read all subscriptions"
  ON subscriptions FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- INSERT/UPDATE via service role only (Stripe webhook)

COMMIT;
