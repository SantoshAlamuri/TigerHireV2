-- Application-scoped WhatsApp log (launch plan) + public interview self-schedule tokens.

BEGIN;

-- Mirrors launch plan: per-application thread for WhatsApp (in addition to whatsapp_message_log by phone).
CREATE TABLE IF NOT EXISTS public.wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES public.applications (id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  wa_message_id text,
  template_name text,
  body text,
  status text,
  raw_payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_messages_wa_message_id
  ON public.wa_messages (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_messages_application_created
  ON public.wa_messages (application_id, created_at DESC);

COMMENT ON TABLE public.wa_messages IS 'WhatsApp messages tied to an application; wa_message_id unique for idempotent ingest.';

ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;

-- RLS: deny direct authenticated access; server uses service role.
CREATE POLICY wa_messages_deny_authenticated_all
  ON public.wa_messages FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- Public (candidate) self-schedule links per pipeline candidate
CREATE TABLE IF NOT EXISTS public.interview_schedule_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  pipeline_candidate_id uuid NOT NULL REFERENCES public.pipeline_candidates (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  booking_done_at timestamptz,
  booked_slot_id uuid REFERENCES public.interview_availability_slots (id) ON DELETE SET NULL,
  reschedule_used boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_schedule_tokens_job
  ON public.interview_schedule_tokens (job_id);

CREATE INDEX IF NOT EXISTS idx_interview_schedule_tokens_expires
  ON public.interview_schedule_tokens (expires_at);

COMMENT ON TABLE public.interview_schedule_tokens IS 'Bearer token (hash) for public candidate self-schedule and one reschedule.';

ALTER TABLE public.interview_schedule_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY interview_schedule_tokens_deny_authenticated_all
  ON public.interview_schedule_tokens FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

COMMIT;
