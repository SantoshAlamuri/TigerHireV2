-- Migration 34: DPDP compliance — consent records, erasure requests, retention log
-- Source: V5 Supplementary G1

-- Consent records — one per candidate per processing purpose
CREATE TABLE IF NOT EXISTS consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  candidate_id uuid REFERENCES candidates(id) ON DELETE CASCADE,
  consent_type text NOT NULL,
    -- 'cv_processing' | 'profile_storage' | 'recruiter_visibility'
    -- 'whatsapp_communication' | 'salary_data' | 'marketing'
  consent_given boolean NOT NULL DEFAULT false,
  consent_text text NOT NULL,
  obtained_via text NOT NULL,
    -- 'whatsapp_message' | 'web_form' | 'invite_email'
  ip_address text,
  whatsapp_message_id text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_phone ON consent_records(phone);
CREATE INDEX IF NOT EXISTS idx_consent_candidate ON consent_records(candidate_id);

-- Erasure requests — right to be forgotten
CREATE TABLE IF NOT EXISTS erasure_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES candidates(id),
  phone text,
  requested_via text NOT NULL,
    -- 'whatsapp' | 'email' | 'web'
  status text DEFAULT 'pending',
    -- pending | in_progress | completed | rejected
  rejection_reason text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Data retention policy audit log
CREATE TABLE IF NOT EXISTS retention_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid,
  deletion_reason text NOT NULL,
    -- 'retention_policy_2yr' | 'erasure_request' | 'admin_action'
  data_deleted jsonb,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE erasure_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_deletions ENABLE ROW LEVEL SECURITY;

-- Consent records are never deletable via user erasure (legal obligation)
-- Only super_admin and service role can read consent records
CREATE POLICY consent_admin_read ON consent_records
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Erasure requests visible to the candidate (own) and super_admin
CREATE POLICY erasure_own ON erasure_requests
  FOR SELECT USING (
    candidate_id IN (SELECT id FROM candidates WHERE phone = (SELECT phone FROM profiles WHERE id = auth.uid()))
    OR EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
