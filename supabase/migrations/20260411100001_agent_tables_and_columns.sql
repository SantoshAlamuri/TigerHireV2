-- Migration: Add fraud detection columns to candidates + agent_email_ingestion table.
-- agent_outcome_signals and agent_learning_index already exist in the DB.

-- 1. Fraud Detector columns on candidates
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS fraud_score smallint
  CHECK (fraud_score IS NULL OR (fraud_score >= 0 AND fraud_score <= 100));
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS fraud_flags jsonb;

COMMENT ON COLUMN candidates.fraud_score IS 'AI fraud risk score 0-100 from the Fraud Detector agent';
COMMENT ON COLUMN candidates.fraud_flags IS 'Array of fraud flags with type, severity, evidence';

-- 2. Agent Email Ingestion table (Communication Agent logs)
CREATE TABLE IF NOT EXISTS agent_email_ingestion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs (id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES organisations (id) ON DELETE CASCADE,
  gmail_message_id text,
  email_id text,
  message_type text NOT NULL,
  subject text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_email_ingestion_candidate
  ON agent_email_ingestion (candidate_id);
CREATE INDEX IF NOT EXISTS idx_agent_email_ingestion_job
  ON agent_email_ingestion (job_id);
CREATE INDEX IF NOT EXISTS idx_agent_email_ingestion_org
  ON agent_email_ingestion (organisation_id);

ALTER TABLE agent_email_ingestion ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_email_ingestion_service_all ON agent_email_ingestion
  FOR ALL USING (true) WITH CHECK (true);
