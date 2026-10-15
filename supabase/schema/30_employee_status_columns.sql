-- Migration 30: Employee status columns + employee_invites table
-- Source: PRD V5 Section 3.1

-- Add employment columns to candidates
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS
  employment_status text DEFAULT 'external';
  -- external | active_employee | resigned | alumni

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS
  employer_company_id uuid REFERENCES organisations(id);

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS
  resignation_declared_at timestamptz;

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS
  profile_unlocked_at timestamptz;

-- Index for company employee lookup
CREATE INDEX IF NOT EXISTS idx_candidates_employer
  ON candidates(employer_company_id)
  WHERE employment_status = 'active_employee';

-- Employee invite tracking
CREATE TABLE IF NOT EXISTS employee_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES organisations(id) NOT NULL,
  email text NOT NULL,
  full_name text,
  invite_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by uuid REFERENCES profiles(id),
  accepted_at timestamptz,
  expires_at timestamptz DEFAULT now() + interval '7 days',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_invites_token
  ON employee_invites(invite_token);

CREATE INDEX IF NOT EXISTS idx_employee_invites_company
  ON employee_invites(company_id);
