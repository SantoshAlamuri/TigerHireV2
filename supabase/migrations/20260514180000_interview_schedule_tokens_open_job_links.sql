-- Allow job-wide self-schedule tokens (first candidate to book wins; pipeline_candidate chosen at booking).

BEGIN;

ALTER TABLE public.interview_schedule_tokens
  ALTER COLUMN pipeline_candidate_id DROP NOT NULL;

COMMENT ON COLUMN public.interview_schedule_tokens.pipeline_candidate_id IS
  'When set, link is for that pipeline row only. When null, link is job-wide; booking requires pipeline_candidate_id in the public book request.';

COMMIT;
