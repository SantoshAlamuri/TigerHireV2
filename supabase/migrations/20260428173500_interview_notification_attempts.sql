BEGIN;

CREATE TABLE IF NOT EXISTS public.interview_notification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  pipeline_candidate_id uuid REFERENCES public.pipeline_candidates (id) ON DELETE SET NULL,
  candidate_id uuid REFERENCES public.candidates (id) ON DELETE SET NULL,
  from_state text NOT NULL,
  to_state text NOT NULL,
  recipient_type text NOT NULL CHECK (recipient_type IN ('candidate', 'interviewer')),
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp', 'ics')),
  template_variant text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('sent', 'suppressed', 'failed')),
  reason_code text,
  reason_detail text,
  provider text,
  provider_message_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_notification_attempts_job_created
  ON public.interview_notification_attempts (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interview_notification_attempts_transition
  ON public.interview_notification_attempts (from_state, to_state, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interview_notification_attempts_pipeline_candidate
  ON public.interview_notification_attempts (pipeline_candidate_id, created_at DESC);

ALTER TABLE public.interview_notification_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY interview_notification_attempts_deny_authenticated_all
  ON public.interview_notification_attempts
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

COMMIT;

