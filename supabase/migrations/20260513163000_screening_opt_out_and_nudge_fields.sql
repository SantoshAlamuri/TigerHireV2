BEGIN;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS do_not_call boolean NOT NULL DEFAULT false;

ALTER TABLE public.screening_jobs
  ADD COLUMN IF NOT EXISTS nudge_sent_at timestamptz;

COMMIT;
