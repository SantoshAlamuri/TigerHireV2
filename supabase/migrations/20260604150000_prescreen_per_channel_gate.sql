-- Phase 3 — Per-channel pre-screen gate (Option A). Prescreen-OWNED objects only.
-- Depends on cascade schema (jd_requirements, prescreen_questions, prescreen_responses,
-- ff_whatsapp_gate flag) shipped in 20260604120000_0001_cascade_schema.sql.
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS) so re-runs are safe across ledger drift.

-- ---------------------------------------------------------------------------
-- applications: gate state (nullable => no gate / flag-off => unaffected)
-- ---------------------------------------------------------------------------
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS gate_status text,
  ADD COLUMN IF NOT EXISTS unverified_must_haves text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'applications_gate_status_check'
  ) THEN
    ALTER TABLE public.applications
      ADD CONSTRAINT applications_gate_status_check
      CHECK (gate_status IS NULL OR gate_status IN ('pending', 'passed', 'failed', 'unverified'));
  END IF;
END $$;

COMMENT ON COLUMN public.applications.gate_status IS
  'Per-channel prescreen gate: NULL (no gate / flag off) | pending | passed | failed | unverified (timeout).';
COMMENT ON COLUMN public.applications.unverified_must_haves IS
  'Must-have labels left unanswered when the gate timed out; surfaced as Unverified: gaps.';

-- Sweep / age queries hit pending rows by created/updated time.
CREATE INDEX IF NOT EXISTS idx_applications_gate_status_pending
  ON public.applications (gate_status, updated_at)
  WHERE gate_status = 'pending';

-- ---------------------------------------------------------------------------
-- prescreen_sessions: one row per gated application (lifecycle state machine)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prescreen_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  channel text NOT NULL,
  state text NOT NULL DEFAULT 'awaiting_reply',
  current_question_index integer NOT NULL DEFAULT 0,
  questions_sent_at timestamptz,
  reminder_sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prescreen_sessions_channel_check
    CHECK (channel IN ('whatsapp', 'form', 'email', 'board')),
  CONSTRAINT prescreen_sessions_state_check
    CHECK (state IN ('awaiting_reply', 'reminded', 'complete'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prescreen_sessions_job_candidate
  ON public.prescreen_sessions (job_id, candidate_id);
CREATE INDEX IF NOT EXISTS idx_prescreen_sessions_state
  ON public.prescreen_sessions (state, questions_sent_at)
  WHERE state <> 'complete';

-- ---------------------------------------------------------------------------
-- RLS: org members read sessions for their jobs; service role writes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.prescreen_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read prescreen_sessions for their jobs" ON public.prescreen_sessions;
CREATE POLICY "Org members can read prescreen_sessions for their jobs"
  ON public.prescreen_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = prescreen_sessions.job_id
        AND j.organisation_id = ANY (public.auth_organisation_ids())
    )
  );

DROP POLICY IF EXISTS "Super admins can read all prescreen_sessions" ON public.prescreen_sessions;
CREATE POLICY "Super admins can read all prescreen_sessions"
  ON public.prescreen_sessions FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- Flag already seeded by cascade migration; ensure present + OFF (no-op if exists).
INSERT INTO public.feature_flags (key, enabled, description)
VALUES ('ff_whatsapp_gate', false, 'Per-channel pre-screen gate (Option A)')
ON CONFLICT (key) DO NOTHING;
