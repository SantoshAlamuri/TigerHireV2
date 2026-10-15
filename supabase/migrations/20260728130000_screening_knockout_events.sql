-- Apply-time screening knockouts rejected candidates BEFORE any row was written:
-- no application, no answers, no audit event. The employer never learned the
-- candidate existed, and the decision could not be reviewed, appealed, or counted
-- for adverse-impact analysis. (Audit 2026-07-28, governance lens.)

CREATE TABLE IF NOT EXISTS public.screening_knockout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  email text,
  phone text,
  candidate_name text,
  answers jsonb,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS screening_knockout_events_job_id_created_at_idx
  ON public.screening_knockout_events (job_id, created_at DESC);

ALTER TABLE public.screening_knockout_events ENABLE ROW LEVEL SECURITY;

-- Org-scoped read for the hiring side; writes are service-role only (the apply
-- path runs unauthenticated).
DROP POLICY IF EXISTS "knockout_events_select" ON public.screening_knockout_events;
CREATE POLICY "knockout_events_select"
  ON public.screening_knockout_events FOR SELECT
  USING (
    (SELECT public.auth_role()) = 'super_admin'::public.app_role
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = screening_knockout_events.job_id
        AND j.organisation_id = ANY (public.auth_organisation_ids())
    )
  );
