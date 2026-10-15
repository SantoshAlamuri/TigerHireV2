-- Prevent the same phone from vouching for the same candidate twice.
ALTER TABLE vouches
  ADD CONSTRAINT uq_vouches_candidate_phone UNIQUE (candidate_id, voucher_phone);

-- Index for rapid-vouch-pattern detection queries (phone + created_at).
CREATE INDEX IF NOT EXISTS idx_vouches_phone_created
  ON vouches (voucher_phone, created_at DESC);
