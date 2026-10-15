-- Brief 11 Phase C: plan auto-execution (comms, slot picker, exception tracking)

BEGIN;

ALTER TABLE public.plan_stages
  ADD COLUMN IF NOT EXISTS comms_template text;

COMMENT ON COLUMN public.plan_stages.comms_template IS
  'WhatsApp template name or email template id fired when a candidate enters this plan stage.';

-- Backfill from legacy comms_template_id when present
UPDATE public.plan_stages
SET comms_template = comms_template_id
WHERE comms_template IS NULL AND comms_template_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.plan_candidate_stage_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.recruitment_plans (id) ON DELETE CASCADE,
  plan_stage_id uuid NOT NULL REFERENCES public.plan_stages (id) ON DELETE CASCADE,
  pipeline_candidate_id uuid NOT NULL REFERENCES public.pipeline_candidates (id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  entered_at timestamptz NOT NULL DEFAULT now(),
  exception_detected_at timestamptz,
  exception_nudged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline_candidate_id, plan_stage_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_candidate_stage_tracking_plan
  ON public.plan_candidate_stage_tracking (plan_id, plan_stage_id);

CREATE INDEX IF NOT EXISTS idx_plan_candidate_stage_tracking_entered
  ON public.plan_candidate_stage_tracking (entered_at);

ALTER TABLE public.plan_candidate_stage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_candidate_stage_tracking_select ON public.plan_candidate_stage_tracking
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.recruitment_plans rp
      WHERE rp.id = plan_candidate_stage_tracking.plan_id
        AND (
          public.auth_role() = 'super_admin'::public.app_role
          OR rp.organisation_id = ANY (public.auth_organisation_ids())
        )
    )
  );

COMMENT ON TABLE public.plan_candidate_stage_tracking IS
  'Tracks when a candidate entered a plan stage for dwell-time exception detection (Brief 11 Phase C).';

COMMIT;
