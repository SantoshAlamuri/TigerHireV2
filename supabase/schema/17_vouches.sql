-- Vouches: third-party attestations for a candidate (collected via WhatsApp).

CREATE TABLE vouches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  voucher_phone text NOT NULL,
  voucher_name text,
  voucher_linkedin text,
  voucher_company text,
  voucher_title text,
  relationship_type text,
  duration text,
  skills_vouched jsonb DEFAULT '[]',
  standout_sentence text,
  rehire_intent text,
  specificity_score smallint CHECK (specificity_score >= 0 AND specificity_score <= 100),
  weight smallint DEFAULT 50 CHECK (weight >= 0 AND weight <= 100),
  overlap_verified boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vouches_candidate_id ON vouches (candidate_id);
CREATE INDEX idx_vouches_voucher_phone ON vouches (voucher_phone);
CREATE INDEX idx_vouches_voucher_phone_candidate ON vouches (voucher_phone, candidate_id);

COMMENT ON TABLE vouches IS 'Vouch flow: relationship_type, duration, skills_vouched, standout_sentence, rehire_intent';
