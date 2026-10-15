-- Indexes for the columns every screen filters applications by.
--
-- `applications` is the busiest table in the product and carried exactly three
-- indexes, all on referral columns: direct_referrer_id, parent_referrer_id and
-- referral_link_id. Nothing on job_id, nothing on status, nothing on
-- candidate_id — while `fit_scores`, a smaller table, carried ten.
--
-- Every job workspace, the portfolio, analytics, the pipeline and the home
-- tiles filter applications by job_id, and most of them then filter by status.
-- Postgres does not create an index for a foreign key automatically, so all of
-- those have been sequential scans over the whole table. At the current data
-- volume that is invisible; it is the kind of thing that is invisible right up
-- until it is the entire product.
--
-- IF NOT EXISTS throughout: the 2026-06-21 Supabase advisor sweep applied some
-- FK indexes directly to both databases via MCP without a migration, so these
-- may already exist on one, both, or neither. Re-running is a no-op, and the
-- migration is what stops a fresh environment from coming up without them.
--
-- Not CONCURRENTLY: migrations run in a transaction, which forbids it. These
-- take a brief write lock on `applications`. Apply when the table is small or
-- during a quiet window; if the table has grown, run the CREATE INDEX
-- CONCURRENTLY equivalents by hand outside a transaction instead.

-- The join every per-job screen makes.
CREATE INDEX IF NOT EXISTS idx_applications_job_id
  ON public.applications (job_id);

-- "Applications for this job, in this state" — the pipeline, the review queue
-- and the portfolio's awaiting-review count all ask exactly this.
CREATE INDEX IF NOT EXISTS idx_applications_job_status
  ON public.applications (job_id, status);

-- The candidate side of the same relation: every candidate profile lists the
-- applications belonging to that person.
CREATE INDEX IF NOT EXISTS idx_applications_candidate_id
  ON public.applications (candidate_id);

-- Analytics and the portfolio both page through applications newest-first.
CREATE INDEX IF NOT EXISTS idx_applications_created_at
  ON public.applications (created_at DESC);

COMMENT ON INDEX public.idx_applications_job_id IS
  'Hot path: every per-job screen filters applications by job_id.';
COMMENT ON INDEX public.idx_applications_job_status IS
  'Hot path: per-job pipeline and review counts filter by job_id + status.';
