-- Allow idibu in per-organisation job board credentials

BEGIN;

ALTER TABLE public.organisation_job_board_credentials
  DROP CONSTRAINT IF EXISTS organisation_job_board_credentials_board_check;

ALTER TABLE public.organisation_job_board_credentials
  ADD CONSTRAINT organisation_job_board_credentials_board_check
  CHECK (board IN ('adzuna', 'indeed', 'idibu'));

COMMENT ON TABLE public.organisation_job_board_credentials IS
  'Per-organisation job board credentials (Adzuna, Indeed, idibu). Encrypted at rest.';

COMMIT;
