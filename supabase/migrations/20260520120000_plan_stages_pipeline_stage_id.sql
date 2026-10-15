-- Link plan_stages to pipeline_stages for stable automation resolution (Option A hardening).

BEGIN;

ALTER TABLE public.plan_stages
  ADD COLUMN IF NOT EXISTS pipeline_stage_id uuid REFERENCES public.pipeline_stages (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plan_stages_pipeline_stage_id
  ON public.plan_stages (pipeline_stage_id)
  WHERE pipeline_stage_id IS NOT NULL;

COMMENT ON COLUMN public.plan_stages.pipeline_stage_id IS
  'FK to pipeline_stages.id for this job; primary join for plan automation. Nullable for legacy rows.';

-- Backfill by stage_order within the same job plan.
UPDATE public.plan_stages ps
SET pipeline_stage_id = pps.id
FROM public.recruitment_plans rp,
     public.pipeline_stages pps
WHERE ps.plan_id = rp.id
  AND pps.job_id = rp.job_id
  AND pps.stage_order = ps.stage_order
  AND ps.pipeline_stage_id IS NULL;

-- Secondary backfill: display_name match (case-insensitive) when order drifted.
UPDATE public.plan_stages ps
SET pipeline_stage_id = pps.id
FROM public.recruitment_plans rp,
     public.pipeline_stages pps
WHERE ps.plan_id = rp.id
  AND pps.job_id = rp.job_id
  AND lower(trim(pps.stage_name)) = lower(trim(ps.display_name))
  AND ps.pipeline_stage_id IS NULL;

COMMIT;
