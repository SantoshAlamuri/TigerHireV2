-- B2: Lock the exact template revision used when the offer was sent (immutable reference).

BEGIN;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS offer_pdf_template_version_id uuid
    REFERENCES public.offer_pdf_template_versions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_offers_pdf_template_version
  ON public.offers (offer_pdf_template_version_id)
  WHERE offer_pdf_template_version_id IS NOT NULL;

COMMENT ON COLUMN public.offers.offer_pdf_template_version_id IS 'B2: offer_pdf_template_versions row frozen at send time; NULL until sent.';

COMMIT;
