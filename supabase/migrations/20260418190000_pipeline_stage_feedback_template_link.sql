BEGIN;

ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS feedback_template_id uuid
  REFERENCES public.feedback_form_templates (id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_feedback_template_id
  ON public.pipeline_stages (feedback_template_id);

COMMENT ON COLUMN public.pipeline_stages.feedback_template_id IS
  'Optional interview feedback template attached to this stage. Used to prefill interviewer feedback workflow.';

COMMIT;
