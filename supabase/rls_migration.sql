-- TigerHire - Row Level Security policies
-- Run AFTER the schema migration (00-09).

BEGIN;

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

-- WAITLIST (all access via service role admin client)

CREATE POLICY "Super admins can read waitlist"
  ON waitlist FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- CONTACT_SUBMISSIONS (all access via service role)

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

CREATE POLICY "Super admins can read all jobs"
  ON jobs FOR SELECT
  USING (public.auth_role() = 'super_admin');

CREATE POLICY "Org hiring roles can create jobs"
  ON jobs FOR INSERT
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'agency')
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

-- AGENT_LOGS (admin-only read; inserts via service role)

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
