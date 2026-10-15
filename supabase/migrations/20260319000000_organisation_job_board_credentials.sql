-- Organisation job board credentials: per-tenant isolation for job distribution
-- Each organisation can configure their own credentials for Adzuna, Indeed, etc.
-- Credentials are encrypted at rest using pgcrypto.

BEGIN;

-- Enable pgcrypto extension for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Organisation job board credentials table
CREATE TABLE organisation_job_board_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  board varchar(64) NOT NULL CHECK (board IN ('adzuna', 'indeed')),
  -- Encrypted credentials (JSON blob encrypted with organisation-specific key)
  -- For Adzuna: {app_id, app_key, advertiser_id?}
  -- For Indeed: {access_token}
  encrypted_credentials bytea NOT NULL,
  -- Metadata
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organisation_id, board)
);

CREATE INDEX idx_org_job_board_creds_org ON organisation_job_board_credentials(organisation_id);
CREATE INDEX idx_org_job_board_creds_board ON organisation_job_board_credentials(board);
CREATE INDEX idx_org_job_board_creds_active ON organisation_job_board_credentials(organisation_id, board)
  WHERE is_active = true;

-- Enable RLS
ALTER TABLE organisation_job_board_credentials ENABLE ROW LEVEL SECURITY;

-- RLS: Organisation admins can manage their own credentials
CREATE POLICY "Org admins can manage own credentials"
  ON organisation_job_board_credentials FOR ALL
  USING (
    organisation_id IN (
      SELECT organisation_id FROM profiles
      WHERE id = auth.uid()
      AND role IN ('company_admin', 'super_admin')
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM profiles
      WHERE id = auth.uid()
      AND role IN ('company_admin', 'super_admin')
    )
  );

-- Note: Service role (used by distribution engine) bypasses RLS automatically

COMMENT ON TABLE organisation_job_board_credentials IS 'Per-organisation job board API credentials with encryption. Supports tenant isolation.';
COMMENT ON COLUMN organisation_job_board_credentials.encrypted_credentials IS 'Encrypted JSON blob containing board-specific credentials. Decrypted using ENCRYPTION_KEY env var.';

-- Helper function to encrypt credentials (called from application code)
-- Note: Actual encryption/decryption happens in application layer for security
-- This table stores the encrypted blob

COMMIT;
