-- In-flight FitScore scoring guard (one active run per job+candidate; stale after 2 minutes).

CREATE TABLE IF NOT EXISTS public.fit_score_scoring_locks (
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  source text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_fit_score_scoring_locks_started_at
  ON public.fit_score_scoring_locks (started_at DESC);

COMMENT ON TABLE public.fit_score_scoring_locks IS
  'Concurrent scoring guard: at most one in_progress FitScore run per job+candidate (service role only).';

ALTER TABLE public.fit_score_scoring_locks ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; no authenticated policies (same pattern as fitscore_extraction_log writes).

CREATE OR REPLACE FUNCTION public.try_acquire_fit_score_scoring_lock(
  p_job_id uuid,
  p_candidate_id uuid,
  p_source text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_stale_before timestamptz := v_now - interval '2 minutes';
  v_rows bigint := 0;
BEGIN
  INSERT INTO public.fit_score_scoring_locks AS l
    (job_id, candidate_id, status, source, started_at, updated_at)
  VALUES
    (p_job_id, p_candidate_id, 'in_progress', p_source, v_now, v_now)
  ON CONFLICT (job_id, candidate_id) DO UPDATE
    SET status = 'in_progress',
        source = COALESCE(EXCLUDED.source, l.source),
        started_at = v_now,
        updated_at = v_now
    WHERE l.status <> 'in_progress'
       OR l.started_at < v_stale_before;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_fit_score_scoring_lock(
  p_job_id uuid,
  p_candidate_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.fit_score_scoring_locks
  SET status = 'completed',
      updated_at = now()
  WHERE job_id = p_job_id
    AND candidate_id = p_candidate_id;
END;
$$;

COMMENT ON FUNCTION public.try_acquire_fit_score_scoring_lock IS
  'Returns true when this worker may proceed with scoring; false if another in-flight run holds the lock.';
