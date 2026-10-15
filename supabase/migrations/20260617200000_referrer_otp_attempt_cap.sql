-- P0: Brute-force protection for referrer OTP verify.
-- Without an attempt cap, a 6-digit OTP (10^6 keyspace) over a 10-minute TTL was
-- guessable with rotating IPs/users (~2.8% success per session at scale). Combined
-- with the referrer-row binding in /api/refer/otp/verify (sets user_id = ctx.userId
-- on first verify), a successful brute force led to referrer account takeover.
-- This cap invalidates an OTP after 5 wrong attempts, dropping brute-force success
-- to ~0.0005% per session — effectively eliminating the takeover surface.

ALTER TABLE public.referrer_otp
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.referrer_otp.attempt_count IS
  'Wrong-code verify attempts. OTP is invalidated (used_at set) when this reaches 5.';

CREATE INDEX IF NOT EXISTS idx_referrer_otp_phone_unused
  ON public.referrer_otp (whatsapp_number, created_at DESC)
  WHERE used_at IS NULL;
