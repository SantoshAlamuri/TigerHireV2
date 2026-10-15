-- Verification claims: Verify Agent output (employment, skill, education, timeline).

CREATE TABLE verification_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  claim_type text,
  claim_text text,
  status text NOT NULL DEFAULT 'unverified',
  evidence text,
  source text,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_verification_claims_candidate_id ON verification_claims (candidate_id);
CREATE INDEX idx_verification_claims_status ON verification_claims (status);

COMMENT ON TABLE verification_claims IS 'Verify Agent: status = confirmed | unverified | flagged; source = linkedin | github | timeline_analysis';
