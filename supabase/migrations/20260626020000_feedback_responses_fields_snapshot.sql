-- Snapshot the scorecard competencies into each feedback response.
--
-- Responses are keyed by competency label; if a template is later edited (labels changed,
-- competencies added/removed), historical feedback would no longer map to the live template.
-- Storing the field set at submission time makes each response self-describing and audit-safe.
ALTER TABLE public.feedback_responses
  ADD COLUMN IF NOT EXISTS fields_snapshot jsonb;

COMMENT ON COLUMN public.feedback_responses.fields_snapshot IS
  'Scorecard competencies (template.fields) at submission time, so editing the template later does not change what past feedback meant.';
