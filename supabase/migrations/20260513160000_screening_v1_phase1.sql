-- Screening V1 Phase 1: organisation-level screening settings + unified screening_jobs.
-- Additive and idempotent where practical.

BEGIN;

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS screening_default_mode text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS voice_screening_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_screening_enabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS voice_screening_free_credits_per_month integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS voice_screening_monthly_cap_inr numeric(10, 2),
  ADD COLUMN IF NOT EXISTS screening_fitscore_threshold integer NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS screening_calling_hours_start time NOT NULL DEFAULT '10:00:00',
  ADD COLUMN IF NOT EXISTS screening_calling_hours_end time NOT NULL DEFAULT '19:00:00',
  ADD COLUMN IF NOT EXISTS screening_auto_trigger boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organisations_screening_default_mode_check'
  ) THEN
    ALTER TABLE public.organisations
      ADD CONSTRAINT organisations_screening_default_mode_check
      CHECK (screening_default_mode IN ('off', 'whatsapp', 'voice'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organisations_screening_fitscore_threshold_check'
  ) THEN
    ALTER TABLE public.organisations
      ADD CONSTRAINT organisations_screening_fitscore_threshold_check
      CHECK (screening_fitscore_threshold BETWEEN 0 AND 100);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.screening_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  req_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('voice', 'whatsapp', 'manual', 'none')),
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN (
      'queued',
      'awaiting_consent',
      'in_progress',
      'completed',
      'no_response',
      'failed',
      'cancelled',
      'skipped'
    )
  ),
  bolna_call_id text,
  audio_url text,
  duration_seconds integer,
  whatsapp_thread_id text,
  whatsapp_message_count integer,
  transcript_url text,
  summary_json jsonb,
  recommendation text CHECK (recommendation IN ('shortlist', 'reject', 'review', 'no_data')),
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  billable boolean NOT NULL DEFAULT false,
  billed_at timestamptz,
  cost_inr numeric(10, 2),
  charge_inr numeric(10, 2),
  triggered_by text CHECK (triggered_by IN ('auto', 'recruiter_manual')),
  overridden_from_mode text CHECK (overridden_from_mode IN ('voice', 'whatsapp', 'manual', 'none')),
  recruiter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS screening_jobs_org_status_idx
  ON public.screening_jobs (organisation_id, status);

CREATE INDEX IF NOT EXISTS screening_jobs_billing_idx
  ON public.screening_jobs (organisation_id, billed_at)
  WHERE billable = true AND mode = 'voice';

CREATE INDEX IF NOT EXISTS screening_jobs_candidate_idx
  ON public.screening_jobs (candidate_id);

CREATE INDEX IF NOT EXISTS screening_jobs_req_idx
  ON public.screening_jobs (req_id);

CREATE INDEX IF NOT EXISTS screening_jobs_org_candidate_req_created_idx
  ON public.screening_jobs (organisation_id, candidate_id, req_id, created_at DESC);

ALTER TABLE public.screening_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'screening_jobs'
      AND policyname = 'screening_jobs_org_select'
  ) THEN
    CREATE POLICY screening_jobs_org_select
      ON public.screening_jobs
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
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'screening_jobs'
      AND policyname = 'screening_jobs_org_insert'
  ) THEN
    CREATE POLICY screening_jobs_org_insert
      ON public.screening_jobs
      FOR INSERT
      WITH CHECK (
        organisation_id = public.auth_organisation_id()
        AND public.auth_role() IN ('company_admin', 'recruiter', 'super_admin', 'agency')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'screening_jobs'
      AND policyname = 'screening_jobs_org_update'
  ) THEN
    CREATE POLICY screening_jobs_org_update
      ON public.screening_jobs
      FOR UPDATE
      USING (
        organisation_id = public.auth_organisation_id()
        AND public.auth_role() IN ('company_admin', 'recruiter', 'super_admin', 'agency')
      )
      WITH CHECK (
        organisation_id = public.auth_organisation_id()
        AND public.auth_role() IN ('company_admin', 'recruiter', 'super_admin', 'agency')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'screening_jobs'
      AND policyname = 'screening_jobs_org_delete'
  ) THEN
    CREATE POLICY screening_jobs_org_delete
      ON public.screening_jobs
      FOR DELETE
      USING (
        organisation_id = public.auth_organisation_id()
        AND public.auth_role() IN ('company_admin', 'recruiter', 'super_admin')
      );
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_screening_jobs_set_updated_at ON public.screening_jobs;
CREATE TRIGGER trg_screening_jobs_set_updated_at
  BEFORE UPDATE ON public.screening_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE IF EXISTS public.sync_logs
  ADD COLUMN IF NOT EXISTS pipeline text DEFAULT 'jobs_sync';

COMMIT;
