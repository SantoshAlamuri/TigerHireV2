-- SEO / Google-for-Jobs geo hardening: per-job country + salary currency.
--
-- The JobPosting JSON-LD builder (src/lib/jobs/job-posting.ts) previously had no job
-- columns to read geography from, so the public job page hardcoded country 'IN' and
-- currency 'INR'. TigerHire is India-first (those stay the code-level defaults), but
-- agencies will post Gulf/remote-global roles, and Google for Jobs filters on
-- addressCountry — a wrong country mis-surfaces or drops the listing.
--
-- Both columns are nullable so existing rows are untouched; the builder treats NULL as
-- the documented defaults (IN / INR). CHECK constraints enforce ISO shapes so a country
-- name ("India") or symbol ("₹") can never land in a code column.
--
-- NOTE (review before applying): the public job API (GET /api/jobs/[id]/public,
-- PUBLIC_JOB_COLUMNS) must add `country, compensation_currency` to its select for the
-- public page to actually surface these; the call site already reads them null-safely.

BEGIN;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS country text
    CONSTRAINT jobs_country_iso2 CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  ADD COLUMN IF NOT EXISTS compensation_currency text DEFAULT 'INR'
    CONSTRAINT jobs_compensation_currency_iso4217
      CHECK (compensation_currency IS NULL OR compensation_currency ~ '^[A-Z]{3}$');

COMMENT ON COLUMN public.jobs.country IS
  'ISO 3166-1 alpha-2 country of the physical job location (e.g. IN, AE). NULL = builder default IN. Used for JobPosting addressCountry and remote applicantLocationRequirements.';
COMMENT ON COLUMN public.jobs.compensation_currency IS
  'ISO 4217 currency of compensation_min/compensation_max (e.g. INR, AED). NULL = builder default INR. Used for JobPosting baseSalary.currency.';

COMMIT;
