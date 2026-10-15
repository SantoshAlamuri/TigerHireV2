-- Referrals: referrer submits candidate (e.g. via WhatsApp "Referring Name — Role — City").

CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES candidates (id) ON DELETE SET NULL,
  target_phone text,
  role_category text,
  location text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_referrals_referrer_id ON referrals (referrer_id);
CREATE INDEX idx_referrals_referrer_target_phone_created_at
  ON referrals (referrer_id, target_phone, created_at DESC)
  WHERE target_phone IS NOT NULL;
CREATE INDEX idx_referrals_candidate_id ON referrals (candidate_id) WHERE candidate_id IS NOT NULL;
CREATE INDEX idx_referrals_status ON referrals (status);

COMMENT ON TABLE referrals IS 'status: pending | cv_received | vouched | shortlisted | hired';
