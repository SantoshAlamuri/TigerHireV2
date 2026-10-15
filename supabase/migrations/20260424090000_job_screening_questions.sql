-- Per-job yes/no screening (knockout) questions; answers stored per application.

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_screening_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  question_text text NOT NULL CHECK (char_length(btrim(question_text)) > 0),
  -- If true, answering "Yes" to this question fails the candidate. If false, "No" fails.
  fail_on_yes boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_screening_job_active
  ON public.job_screening_questions (job_id)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.application_screening_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications (id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.job_screening_questions (id) ON DELETE CASCADE,
  answer_yes boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_app_screening_answers_app ON public.application_screening_answers (application_id);

ALTER TABLE public.job_screening_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_screening_answers ENABLE ROW LEVEL SECURITY;

-- Anyone can read active questions for open jobs (public apply)
CREATE POLICY "job_screening public read open job"
  ON public.job_screening_questions
  FOR SELECT
  USING (
    is_active = true
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.status = 'open')
  );

-- Org staff read all questions for their org (editing / closed jobs)
CREATE POLICY "job_screening org read"
  ON public.job_screening_questions
  FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN (
      'company_admin',
      'recruiter',
      'hiring_manager',
      'finance',
      'super_admin',
      'agency'
    )
  );

CREATE POLICY "job_screening org insert"
  ON public.job_screening_questions
  FOR INSERT
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'super_admin')
  );

CREATE POLICY "job_screening org update"
  ON public.job_screening_questions
  FOR UPDATE
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'super_admin')
  )
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'super_admin')
  );

CREATE POLICY "job_screening org delete"
  ON public.job_screening_questions
  FOR DELETE
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'super_admin')
  );

-- Candidate: read own answers; org staff: read for their org's applications
CREATE POLICY "app_screening read candidate"
  ON public.application_screening_answers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.candidates c ON c.id = a.candidate_id
      WHERE a.id = application_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "app_screening read org"
  ON public.application_screening_answers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
      WHERE a.id = application_id
        AND j.organisation_id = public.auth_organisation_id()
        AND public.auth_role() IN (
          'company_admin',
          'recruiter',
          'hiring_manager',
          'finance',
          'super_admin',
          'agency'
        )
    )
  );

-- Writes: service role in API (bypass) — no INSERT for anon JWT

COMMENT ON TABLE public.job_screening_questions IS
  'Yes/No pre-screen; fail_on_yes=true means a Yes answer rejects the application.';
COMMENT ON TABLE public.application_screening_answers IS
  'Stored for passed screening only; inserts via server (service role) after application create.';

COMMIT;
