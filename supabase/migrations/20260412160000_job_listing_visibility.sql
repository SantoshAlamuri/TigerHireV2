-- Where an open job may appear: public anonymous board vs internal (org) referral flows.
-- At least one must be true so the job is discoverable somewhere.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS list_on_public_job_board boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS list_for_internal_referrals boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN jobs.list_on_public_job_board IS 'When true, job may appear on the public job board and anonymous refer job pickers.';
COMMENT ON COLUMN jobs.list_for_internal_referrals IS 'When true, job may appear in org-scoped employee/referrer pickers for that organisation.';

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_listing_at_least_one_chk;
ALTER TABLE jobs ADD CONSTRAINT jobs_listing_at_least_one_chk
  CHECK (list_on_public_job_board OR list_for_internal_referrals);
