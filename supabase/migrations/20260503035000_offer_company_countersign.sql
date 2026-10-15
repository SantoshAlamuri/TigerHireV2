-- Support sequential company -> candidate countersign flow for native offers.
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS company_signer_name text,
  ADD COLUMN IF NOT EXISTS company_signer_email text,
  ADD COLUMN IF NOT EXISTS company_sign_token text,
  ADD COLUMN IF NOT EXISTS company_sign_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS company_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS company_signer_ip text,
  ADD COLUMN IF NOT EXISTS company_signer_user_agent text;

ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_signing_status_check;
ALTER TABLE public.offers
  ADD CONSTRAINT offers_signing_status_check
  CHECK (
    signing_status IS NULL
    OR signing_status IN (
      'pending_company',
      'sent',
      'viewed',
      'signed',
      'declined',
      'expired',
      'withdrawn'
    )
  );

COMMENT ON COLUMN public.offers.company_signer_name IS
  'Assigned company representative display name for first-signature step.';
COMMENT ON COLUMN public.offers.company_signer_email IS
  'Assigned company representative email for first-signature step.';
COMMENT ON COLUMN public.offers.company_sign_token IS
  'One-time token used in company signer email link.';
COMMENT ON COLUMN public.offers.company_sign_requested_at IS
  'Timestamp when company signer invitation was dispatched.';
COMMENT ON COLUMN public.offers.company_signed_at IS
  'Timestamp when company representative completed first signature.';
