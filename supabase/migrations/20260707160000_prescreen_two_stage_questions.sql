-- Two-stage screening: questions are asked either at apply time (knockout
-- pre-screen) or after the candidate is shortlisted (deeper qualification).
-- Both entry paths (public apply, recruiter upload) share this machinery.

ALTER TABLE public.prescreen_questions
  ADD COLUMN IF NOT EXISTS ask_stage text NOT NULL DEFAULT 'apply';

ALTER TABLE public.prescreen_questions
  DROP CONSTRAINT IF EXISTS prescreen_questions_ask_stage_check;
ALTER TABLE public.prescreen_questions
  ADD CONSTRAINT prescreen_questions_ask_stage_check
  CHECK (ask_stage IN ('apply', 'post_shortlist'));

COMMENT ON COLUMN public.prescreen_questions.ask_stage IS
  'apply = knockout pre-screen at application time; post_shortlist = deeper questions sent when the candidate is shortlisted (never auto-rejects).';

-- Sessions get the same dimension so one candidate can complete the apply
-- round and later run a separate post-shortlist round on the same job.
ALTER TABLE public.prescreen_sessions
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'apply';

ALTER TABLE public.prescreen_sessions
  DROP CONSTRAINT IF EXISTS prescreen_sessions_stage_check;
ALTER TABLE public.prescreen_sessions
  ADD CONSTRAINT prescreen_sessions_stage_check
  CHECK (stage IN ('apply', 'post_shortlist'));

-- Replace the (job, candidate) unique index with (job, candidate, stage).
DROP INDEX IF EXISTS uq_prescreen_sessions_job_candidate;
CREATE UNIQUE INDEX IF NOT EXISTS uq_prescreen_sessions_job_candidate_stage
  ON public.prescreen_sessions (job_id, candidate_id, stage);
