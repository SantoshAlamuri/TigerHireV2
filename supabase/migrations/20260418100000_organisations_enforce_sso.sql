-- Per-organisation SSO enforcement policy for company-side users.
ALTER TABLE organisations
ADD COLUMN IF NOT EXISTS enforce_sso boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organisations.enforce_sso IS
  'When true, company-side roles in this organisation must authenticate via SSO.';
