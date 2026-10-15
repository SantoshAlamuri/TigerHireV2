-- Optional: link profile to WhatsApp for referral flow (referrer identified by phone).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone ON profiles (phone) WHERE phone IS NOT NULL;

COMMENT ON COLUMN profiles.phone IS 'WhatsApp number; used to identify referrer in referral flow.';