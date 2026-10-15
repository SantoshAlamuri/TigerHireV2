-- AI Notetaker (Recall.ai): join live interviews, record + transcribe, summarise.
--
-- This migration adds the storage the notetaker needs:
--   1. A manual meeting-join link on each interview slot (recruiter pastes Zoom/Meet/Teams URL).
--   2. An `interview_recordings` ledger tracking each dispatched Recall bot through its lifecycle.
--   3. Per-org notetaker toggle + monthly INR cap (mirrors the voice-screening guardrails).
--   4. The `notetaker_recall` runtime feature flag (default OFF; platform-wide kill switch).
--
-- Bot dispatch and webhook ingestion run via the service-role admin client, so writes to
-- interview_recordings bypass RLS. The SELECT policy below exposes rows to org members + super_admin.
-- DB-safety: file only — do not apply to prod/preview without operator approval (per CLAUDE.md).

-- 1. Manual meeting link on the interview slot ------------------------------------------------
ALTER TABLE public.interview_availability_slots
  ADD COLUMN IF NOT EXISTS meeting_url text,
  ADD COLUMN IF NOT EXISTS meeting_provider text
    CHECK (meeting_provider IS NULL OR meeting_provider IN ('zoom', 'teams', 'meet', 'other'));

COMMENT ON COLUMN public.interview_availability_slots.meeting_url IS
  'Optional live-interview join link (Zoom/Teams/Meet) the recruiter pastes; consumed by the Recall notetaker.';
COMMENT ON COLUMN public.interview_availability_slots.meeting_provider IS
  'Video platform hint for the meeting_url (zoom|teams|meet|other).';

-- 2. Per-org notetaker guardrails (mirror voice_screening_enabled / _monthly_cap_inr) ---------
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS notetaker_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notetaker_monthly_cap_inr numeric;

COMMENT ON COLUMN public.organisations.notetaker_enabled IS
  'Org-level toggle for the Recall notetaker. Sits beneath the global notetaker_recall flag.';
COMMENT ON COLUMN public.organisations.notetaker_monthly_cap_inr IS
  'Optional monthly INR spend cap for notetaker recordings; null = no cap. Enforced best-effort before dispatch.';

-- 3. Recording lifecycle ledger ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.interview_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  slot_id uuid REFERENCES public.interview_availability_slots (id) ON DELETE SET NULL,
  pipeline_candidate_id uuid REFERENCES public.pipeline_candidates (id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs (id) ON DELETE SET NULL,
  recall_bot_id text,
  meeting_url text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'joining', 'in_call', 'done', 'failed', 'no_show')),
  recording_url text,
  transcript_url text,
  summary_json jsonb,
  duration_seconds integer,
  cost_usd numeric,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One ledger row per Recall bot within an org (webhook correlation key).
CREATE UNIQUE INDEX IF NOT EXISTS uq_interview_recordings_org_bot
  ON public.interview_recordings (organisation_id, recall_bot_id)
  WHERE recall_bot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interview_recordings_org_created_at
  ON public.interview_recordings (organisation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interview_recordings_slot
  ON public.interview_recordings (slot_id);

CREATE INDEX IF NOT EXISTS idx_interview_recordings_pipeline_candidate
  ON public.interview_recordings (pipeline_candidate_id);

COMMENT ON TABLE public.interview_recordings IS
  'Recall.ai notetaker lifecycle ledger: one row per bot dispatched to a live interview, with transcript URL and Claude scorecard.';

ALTER TABLE public.interview_recordings ENABLE ROW LEVEL SECURITY;

-- Reads: org members of the owning organisation (writes happen via service-role admin client).
CREATE POLICY "Org members can read interview recordings"
  ON public.interview_recordings FOR SELECT
  USING (
    public.auth_role() = 'super_admin'
    OR organisation_id = ANY (public.auth_organisation_ids())
  );

-- 4. Runtime feature flag — default OFF, platform-wide kill switch (ON CONFLICT keeps operator state)
INSERT INTO public.feature_flags (key, enabled, description)
VALUES (
  'notetaker_recall',
  false,
  'Master switch for the Recall.ai AI notetaker (join/record/transcribe/summarise live interviews). Default OFF; sits above per-org notetaker_enabled.'
)
ON CONFLICT (key) DO NOTHING;
