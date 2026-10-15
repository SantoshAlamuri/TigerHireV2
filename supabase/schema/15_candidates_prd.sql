-- PRD: WhatsApp/Scout CV flow. Add columns for CV drop, trust, ghost risk, referral.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS signal_sources text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS cv_url text,
  ADD COLUMN IF NOT EXISTS cv_raw_text text,
  ADD COLUMN IF NOT EXISTS cv_parsed_at timestamptz,
  ADD COLUMN IF NOT EXISTS trust_score smallint DEFAULT 20 CHECK (trust_score >= 0 AND trust_score <= 100),
  ADD COLUMN IF NOT EXISTS ghost_risk_score smallint DEFAULT 50 CHECK (ghost_risk_score >= 0 AND ghost_risk_score <= 100),
  ADD COLUMN IF NOT EXISTS entry_path text DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS availability text,
  ADD COLUMN IF NOT EXISTS seniority_level text,
  ADD COLUMN IF NOT EXISTS current_role text,
  ADD COLUMN IF NOT EXISTS current_company text,
  ADD COLUMN IF NOT EXISTS salary_expectation_min integer,
  ADD COLUMN IF NOT EXISTS salary_expectation_max integer,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS github_url text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_phone_unique ON candidates (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_candidates_trust_score ON candidates (trust_score DESC) WHERE trust_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_candidates_phone ON candidates (phone) WHERE phone IS NOT NULL;

COMMENT ON COLUMN candidates.entry_path IS 'self | referral | whatsapp_drop';
COMMENT ON COLUMN candidates.trust_score IS '0-100 from vouches, verification_claims, profile completeness';
COMMENT ON COLUMN candidates.ghost_risk_score IS '0-100 reliability; lower = higher no-show risk';
