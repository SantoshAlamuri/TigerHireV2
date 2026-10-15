-- Pipeline stage types, SLA, notifications, org defaults seeding, placement billing events.

BEGIN;

CREATE TYPE public.pipeline_stage_type AS ENUM (
  'system_auto',
  'screening',
  'interview',
  'assessment',
  'offer',
  'terminal_hired',
  'terminal_reject'
);

ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS stage_type public.pipeline_stage_type NOT NULL DEFAULT 'screening',
  ADD COLUMN IF NOT EXISTS sla_days integer,
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_candidate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS notify_email_body text;

ALTER TABLE public.org_pipeline_stage_defaults
  ADD COLUMN IF NOT EXISTS stage_type public.pipeline_stage_type NOT NULL DEFAULT 'screening',
  ADD COLUMN IF NOT EXISTS sla_days integer,
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_candidate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS notify_email_body text;

COMMENT ON COLUMN public.pipeline_stages.stage_type IS 'Semantic category for gating, billing, and SLA.';
COMMENT ON COLUMN public.org_pipeline_stage_defaults.notify_email_body IS 'Optional HTML/plain override when notify_candidate is true.';

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS stage_type public.pipeline_stage_type,
  ADD COLUMN IF NOT EXISTS billing_ctc_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offer_accepted_at timestamptz;

CREATE TABLE IF NOT EXISTS public.placement_fee_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates (id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.applications (id) ON DELETE SET NULL,
  offer_accepted_at timestamptz NOT NULL DEFAULT now(),
  ctc_value numeric,
  billing_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_placement_fee_billing_org
  ON public.placement_fee_billing_events (organisation_id);

CREATE INDEX IF NOT EXISTS idx_placement_fee_billing_job
  ON public.placement_fee_billing_events (job_id);

CREATE UNIQUE INDEX IF NOT EXISTS placement_fee_one_pending_per_application
  ON public.placement_fee_billing_events (application_id)
  WHERE billing_status = 'pending';

ALTER TABLE public.placement_fee_billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins read placement fee billing" ON public.placement_fee_billing_events;
CREATE POLICY "Org admins read placement fee billing"
  ON public.placement_fee_billing_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organisation_id = placement_fee_billing_events.organisation_id
        AND p.role IN ('super_admin', 'company_admin', 'recruiter', 'finance')
    )
  );

DROP POLICY IF EXISTS "Super admin read placement fee billing" ON public.placement_fee_billing_events;
CREATE POLICY "Super admin read placement fee billing"
  ON public.placement_fee_billing_events FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- Seed helper: TigerHire default org template (11 rows). Idempotent per org.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_org_default_pipeline_stages(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  SELECT count(*)::int INTO n FROM public.org_pipeline_stage_defaults WHERE organisation_id = p_org_id;
  IF n > 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.org_pipeline_stage_defaults (
    organisation_id, stage_name, stage_order, stage_type, sla_days, is_locked, notify_candidate, color, notify_email_body
  ) VALUES
    (p_org_id, 'Applied', 0, 'system_auto', 1, true, false, '#64748b', NULL),
    (p_org_id, 'FitScore Review', 1, 'system_auto', 1, true, false, '#6366f1', NULL),
    (p_org_id, 'Shortlisted', 2, 'screening', 3, false, true, '#22c55e', NULL),
    (p_org_id, 'Recruiter Call', 3, 'screening', 3, false, true, '#84cc16', NULL),
    (p_org_id, 'Interview', 4, 'interview', 5, false, true, '#3b82f6', NULL),
    (p_org_id, 'Final Round', 5, 'interview', 5, false, true, '#8b5cf6', NULL),
    (p_org_id, 'Offer Sent', 6, 'offer', 3, false, true, '#f59e0b', NULL),
    (p_org_id, 'Offer Accepted', 7, 'offer', 14, false, true, '#10b981', NULL),
    (p_org_id, 'Hired', 8, 'terminal_hired', NULL, true, true, '#059669', NULL),
    (p_org_id, 'Rejected', 9, 'terminal_reject', NULL, true, false, '#ef4444', NULL),
    (p_org_id, 'Withdrawn', 10, 'terminal_reject', NULL, true, false, '#78716c', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_organisations_seed_pipeline_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.seed_org_default_pipeline_stages(NEW.id);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS organisations_seed_pipeline_defaults ON public.organisations;
CREATE TRIGGER organisations_seed_pipeline_defaults
AFTER INSERT ON public.organisations
FOR EACH ROW
EXECUTE PROCEDURE public.trg_organisations_seed_pipeline_defaults();

-- Backfill existing organisations that have no defaults yet
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT o.id
    FROM public.organisations o
    WHERE NOT EXISTS (
      SELECT 1 FROM public.org_pipeline_stage_defaults d WHERE d.organisation_id = o.id
    )
  LOOP
    PERFORM public.seed_org_default_pipeline_stages(r.id);
  END LOOP;
END $$;

COMMIT;
