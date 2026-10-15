-- Brief 8 Phase A: interviewer-declared availability windows + slot source tagging.

BEGIN;

CREATE TABLE IF NOT EXISTS public.interviewer_availability_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  recurring_pattern text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interviewer_availability_windows_valid_window CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_interviewer_availability_windows_user_starts
  ON public.interviewer_availability_windows (user_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_interviewer_availability_windows_org_starts
  ON public.interviewer_availability_windows (organisation_id, starts_at);

COMMENT ON TABLE public.interviewer_availability_windows IS
  'Personal availability blocks declared by interviewers/HMs for recruiters to book interview slots.';

ALTER TABLE public.interviewer_availability_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY interviewer_availability_windows_select_own_org
  ON public.interviewer_availability_windows
  FOR SELECT
  TO authenticated
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN (
      'super_admin',
      'leadership',
      'recruiter',
      'agency',
      'hiring_manager',
      'interviewer',
      'company_admin'
    )
  );

CREATE POLICY interviewer_availability_windows_insert_own
  ON public.interviewer_availability_windows
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN (
      'super_admin',
      'leadership',
      'recruiter',
      'agency',
      'hiring_manager',
      'interviewer',
      'company_admin'
    )
  );

CREATE POLICY interviewer_availability_windows_update_own
  ON public.interviewer_availability_windows
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND organisation_id = public.auth_organisation_id()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND organisation_id = public.auth_organisation_id()
  );

CREATE TABLE IF NOT EXISTS public.interviewer_availability_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interviewer_availability_nudges_unique_job_user UNIQUE (job_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_interviewer_availability_nudges_user_sent
  ON public.interviewer_availability_nudges (user_id, sent_at DESC);

ALTER TABLE public.interviewer_availability_nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY interviewer_availability_nudges_deny_authenticated
  ON public.interviewer_availability_nudges
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

ALTER TABLE public.interview_availability_slots
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'recruiter_manual';

ALTER TABLE public.interview_availability_slots
  DROP CONSTRAINT IF EXISTS interview_availability_slots_source_check;

ALTER TABLE public.interview_availability_slots
  ADD CONSTRAINT interview_availability_slots_source_check
  CHECK (source IN ('recruiter_manual', 'interviewer_declared'));

COMMENT ON COLUMN public.interview_availability_slots.source IS
  'How the slot was created: recruiter_manual (default) or interviewer_declared (picked from availability window).';

COMMIT;
