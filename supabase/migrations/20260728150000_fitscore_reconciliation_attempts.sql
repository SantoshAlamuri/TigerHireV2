-- Backs the unscored-application sweeper's attempt cap. Without it a permanently
-- unscoreable pair (no extractable CV text, knockout, unapproved rubric) would be
-- re-enqueued on every run forever, amplifying LLM spend with no progress.

CREATE TABLE IF NOT EXISTS public.fitscore_reconciliation_attempts (
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, candidate_id)
);

ALTER TABLE public.fitscore_reconciliation_attempts ENABLE ROW LEVEL SECURITY;
-- Operational bookkeeping only: service-role (cron) writes, no client access.
-- RLS enabled with zero policies = deny-all for anon/authenticated.

CREATE OR REPLACE FUNCTION public.bump_fitscore_reconciliation_attempt(
  p_job_id uuid,
  p_candidate_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
  INSERT INTO public.fitscore_reconciliation_attempts (job_id, candidate_id, attempts, last_attempt_at)
  VALUES (p_job_id, p_candidate_id, 1, now())
  ON CONFLICT (job_id, candidate_id)
  DO UPDATE SET
    attempts = public.fitscore_reconciliation_attempts.attempts + 1,
    last_attempt_at = now();
$$;

REVOKE ALL ON FUNCTION public.bump_fitscore_reconciliation_attempt(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_fitscore_reconciliation_attempt(uuid, uuid) TO service_role;
