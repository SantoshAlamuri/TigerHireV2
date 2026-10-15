-- Brief 8 Phase C: WhatsApp slot picker tracking, interviewer feedback nudges, candidate no-response.

BEGIN;

CREATE TABLE IF NOT EXISTS public.interview_slot_picker_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  pipeline_candidate_id uuid NOT NULL REFERENCES public.pipeline_candidates (id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates (id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.pipeline_stages (id) ON DELETE SET NULL,
  initiated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  reminder_sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'booked', 'no_response')),
  slot_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  template_name text,
  provider_message_id text,
  no_response_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_slot_picker_requests_pc_active
  ON public.interview_slot_picker_requests (pipeline_candidate_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_interview_slot_picker_requests_sent_at
  ON public.interview_slot_picker_requests (sent_at)
  WHERE status = 'pending';

COMMENT ON TABLE public.interview_slot_picker_requests IS
  'Tracks WhatsApp slot picker offers to candidates (Brief 8 Phase C).';

CREATE TABLE IF NOT EXISTS public.interview_feedback_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_candidate_id uuid NOT NULL REFERENCES public.pipeline_candidates (id) ON DELETE CASCADE,
  slot_id uuid REFERENCES public.interview_availability_slots (id) ON DELETE SET NULL,
  interviewer_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  nudged_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interview_feedback_nudges_unique_pc UNIQUE (pipeline_candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_interview_feedback_nudges_nudged_at
  ON public.interview_feedback_nudges (nudged_at DESC);

COMMENT ON TABLE public.interview_feedback_nudges IS
  'Dedupes 24h-post-interview interviewer feedback nudges (Brief 8 Phase C).';

ALTER TABLE public.interview_slot_picker_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_feedback_nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY interview_slot_picker_requests_deny_authenticated
  ON public.interview_slot_picker_requests
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY interview_feedback_nudges_deny_authenticated
  ON public.interview_feedback_nudges
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

COMMIT;
