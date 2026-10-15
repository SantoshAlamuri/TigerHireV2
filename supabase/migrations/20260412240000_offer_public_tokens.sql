-- A15: Public offer link + OTP (no account). Token minted at send only.

BEGIN;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS public_token text,
  ADD COLUMN IF NOT EXISTS public_token_otp text,
  ADD COLUMN IF NOT EXISTS public_token_otp_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_token_viewed_at timestamptz;

COMMENT ON COLUMN public.offers.public_token IS 'A15: unguessable hex token; set when offer is sent; public URL /offers/[token].';
COMMENT ON COLUMN public.offers.public_token_otp IS 'A15: HMAC-SHA256 hash of 6-digit OTP (never store plaintext).';
COMMENT ON COLUMN public.offers.public_token_otp_expires_at IS 'A15: OTP validity (e.g. 15 minutes from send).';
COMMENT ON COLUMN public.offers.public_token_viewed_at IS 'A15: first successful OTP verification timestamp.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_public_token_unique
  ON public.offers (public_token)
  WHERE public_token IS NOT NULL;

COMMIT;
