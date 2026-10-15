-- Migration 31: Employee referrals table + resignation audit log
-- Source: PRD V5 Section 3.1

CREATE TABLE IF NOT EXISTS employee_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid REFERENCES profiles(id) NOT NULL,
  referrer_company_id uuid REFERENCES organisations(id) NOT NULL,
  candidate_id uuid REFERENCES candidates(id),
  job_id uuid REFERENCES jobs(id) NOT NULL,
  candidate_phone text NOT NULL,
  candidate_name text NOT NULL,
  status text DEFAULT 'invited',
    -- invited | cv_received | scored | shortlisted | interviewed | hired | rejected
  referral_bonus_eligible boolean DEFAULT false,
  referral_bonus_paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_referrals_referrer
  ON employee_referrals(referrer_id);

CREATE INDEX IF NOT EXISTS idx_employee_referrals_company
  ON employee_referrals(referrer_company_id);

-- Resignation audit log
CREATE TABLE IF NOT EXISTS resignation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES candidates(id) NOT NULL,
  declared_by text NOT NULL,  -- 'self' | 'admin'
  declared_by_user_id uuid REFERENCES profiles(id),
  disputed boolean DEFAULT false,
  disputed_by uuid REFERENCES profiles(id),
  disputed_at timestamptz,
  dispute_reason text,
  profile_unlock_scheduled_at timestamptz,
  profile_unlocked_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resignation_candidate
  ON resignation_events(candidate_id);
