-- Prevent overlapping cron executions with a DB-backed lease.

CREATE TABLE IF NOT EXISTS public.cron_job_locks (
  job_name text PRIMARY KEY,
  lease_owner text NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_cron_job_locks_lease_expires_at
  ON public.cron_job_locks (lease_expires_at);

ALTER TABLE public.cron_job_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage cron_job_locks" ON public.cron_job_locks;
CREATE POLICY "Service role can manage cron_job_locks"
  ON public.cron_job_locks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.acquire_cron_lease(
  p_job_name text,
  p_lease_owner text,
  p_ttl_seconds integer DEFAULT 900
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.cron_job_locks (job_name, lease_owner, lease_expires_at, updated_at)
  VALUES (
    p_job_name,
    p_lease_owner,
    timezone('utc', now()) + make_interval(secs => GREATEST(p_ttl_seconds, 1)),
    timezone('utc', now())
  )
  ON CONFLICT (job_name) DO UPDATE
  SET
    lease_owner = EXCLUDED.lease_owner,
    lease_expires_at = EXCLUDED.lease_expires_at,
    updated_at = timezone('utc', now())
  WHERE
    public.cron_job_locks.lease_expires_at <= timezone('utc', now())
    OR public.cron_job_locks.lease_owner = EXCLUDED.lease_owner;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_cron_lease(
  p_job_name text,
  p_lease_owner text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.cron_job_locks
  WHERE job_name = p_job_name
    AND lease_owner = p_lease_owner;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_cron_lease(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_cron_lease(text, text, integer)
  TO authenticated, service_role, postgres;

REVOKE ALL ON FUNCTION public.release_cron_lease(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_cron_lease(text, text)
  TO authenticated, service_role, postgres;

COMMENT ON TABLE public.cron_job_locks IS 'Distributed lease table for long-running cron tasks.';
