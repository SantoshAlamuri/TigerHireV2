-- Jobs V2: source/tier metadata, curated filters, sync telemetry.
-- Additive migration only; keeps native tenant-scoped behavior unchanged.

BEGIN;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'tigerhire',
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_job_id text,
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'native',
  ADD COLUMN IF NOT EXISTS role_category text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS fetched_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS dedup_fingerprint text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_tier_check;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_tier_check CHECK (tier IN ('native', 'aggregated'));

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_role_category_check;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_role_category_check CHECK (
    role_category IS NULL
    OR role_category IN (
      'backend',
      'frontend',
      'data_ml',
      'product',
      'devops',
      'design',
      'sales',
      'finance'
    )
  );

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_city_check;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_city_check CHECK (
    city IS NULL
    OR city IN (
      'bangalore',
      'delhi_ncr',
      'mumbai',
      'hyderabad',
      'chennai',
      'pune',
      'remote'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS jobs_source_dedup_idx
  ON public.jobs (source, source_job_id)
  WHERE source <> 'tigerhire' AND source_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS jobs_dedup_fingerprint_idx
  ON public.jobs (dedup_fingerprint);

CREATE INDEX IF NOT EXISTS jobs_filter_idx
  ON public.jobs (tier, role_category, city, is_active, posted_at DESC);

CREATE TABLE IF NOT EXISTS public.sync_logs (
  id bigserial PRIMARY KEY,
  source text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  jobs_fetched int NOT NULL DEFAULT 0,
  jobs_inserted int NOT NULL DEFAULT 0,
  jobs_updated int NOT NULL DEFAULT 0,
  jobs_dropped int NOT NULL DEFAULT 0,
  error text
);

CREATE INDEX IF NOT EXISTS sync_logs_source_started_at_idx
  ON public.sync_logs (source, started_at DESC);

COMMIT;
