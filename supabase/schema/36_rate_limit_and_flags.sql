-- Migration 36: Rate limit log + Feature flags
-- Source: V5 Supplementary G6 + G7

-- Rate limit tracking
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id bigserial PRIMARY KEY,
  key text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_key_time
  ON rate_limit_log(key, created_at);

-- Feature flags for agent kill switches and feature toggles
CREATE TABLE IF NOT EXISTS feature_flags (
  key text PRIMARY KEY,
  enabled boolean DEFAULT true,
  description text,
  updated_by text,
  updated_at timestamptz DEFAULT now()
);

-- Seed with all major features
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('scout_agent', true, 'CV parsing via WhatsApp'),
  ('fitscore_agent', true, 'FitScore calculation on new CV/JD'),
  ('rerank_agent', true, 'Claude re-rank pass on top 10'),
  ('vouch_agent', true, 'Vouch collection via WhatsApp'),
  ('verify_agent', true, 'Background verification checks'),
  ('scheduler_agent', true, 'Interview slot scheduling'),
  ('ghostbuster_authenticity_agent', true, 'Candidate Authenticity Check — AI-authorship and anti-manipulation signals'),
  ('circular_vouch_depth_3', false, 'Block depth-3 circular vouch rings (A->B->C->A)'),
  ('ghostbuster', true, 'Heuristic reliability / engagement scoring (ghost_risk_score)'),
  ('employee_portal', true, 'Employee referral portal'),
  ('salary_arbitrage', false, 'Salary recommendations (Phase 2)'),
  ('ai_summaries', true, 'Claude AI summaries on candidate cards'),
  ('consent_flow', true, 'DPDP consent capture — DO NOT DISABLE'),
  ('whatsapp_templates', true, 'Use approved templates for outbound — DO NOT DISABLE')
ON CONFLICT DO NOTHING;

-- RLS: only super_admin can modify feature flags
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY super_admin_flags ON feature_flags
  FOR ALL USING (
    EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Rate limit log does not need RLS (accessed via service role only)
ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;
