-- B1: E-signature fields on offers (DocuSign / future providers).

BEGIN;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS esign_provider text,
  ADD COLUMN IF NOT EXISTS esign_envelope_id text,
  ADD COLUMN IF NOT EXISTS esign_status text,
  ADD COLUMN IF NOT EXISTS esign_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS esign_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS esign_document_url text;

COMMENT ON COLUMN public.offers.esign_provider IS 'e-sign integration id, e.g. docusign, hellosign';
COMMENT ON COLUMN public.offers.esign_envelope_id IS 'Provider envelope / signature request id for webhooks';
COMMENT ON COLUMN public.offers.esign_status IS 'Provider-agnostic: sent, viewed, signed, declined, voided';
COMMENT ON COLUMN public.offers.esign_document_url IS 'Completed document URL from provider when available';

CREATE INDEX IF NOT EXISTS idx_offers_esign_envelope_id
  ON public.offers (esign_envelope_id)
  WHERE esign_envelope_id IS NOT NULL;

COMMIT;
