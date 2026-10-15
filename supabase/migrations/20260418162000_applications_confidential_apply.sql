-- Add optional confidential apply flag for internal mobility use-cases.
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS confidential_apply boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN applications.confidential_apply IS
  'When true, application should follow confidential visibility rules until policy allows broader access.';
