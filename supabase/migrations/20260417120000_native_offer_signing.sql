-- Native offer signing (replaces DocuSign): signing columns, audit trail, storage bucket, billing link.

BEGIN;

-- Allow explicit withdrawn state (recruiter pulls offer back).
ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_status_check;
ALTER TABLE public.offers
  ADD CONSTRAINT offers_status_check
  CHECK (status IN (
    'draft',
    'pending_finance',
    'approved',
    'rejected',
    'sent',
    'accepted',
    'declined',
    'expired',
    'negotiating',
    'withdrawn'
  ));

DROP INDEX IF EXISTS idx_offers_application_active;
CREATE UNIQUE INDEX idx_offers_application_active
  ON public.offers (application_id)
  WHERE status IN ('draft', 'pending_finance', 'approved', 'sent', 'negotiating');

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS signing_status text,
  ADD COLUMN IF NOT EXISTS first_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS signer_name text,
  ADD COLUMN IF NOT EXISTS signer_ip text,
  ADD COLUMN IF NOT EXISTS signer_user_agent text,
  ADD COLUMN IF NOT EXISTS document_hash text,
  ADD COLUMN IF NOT EXISTS document_content text,
  ADD COLUMN IF NOT EXISTS signed_pdf_path text,
  ADD COLUMN IF NOT EXISTS decline_reason text,
  ADD COLUMN IF NOT EXISTS last_signing_reminder_at timestamptz;

ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_signing_status_check;
ALTER TABLE public.offers
  ADD CONSTRAINT offers_signing_status_check
  CHECK (
    signing_status IS NULL
    OR signing_status IN ('sent', 'viewed', 'signed', 'declined', 'expired', 'withdrawn')
  );

COMMENT ON COLUMN public.offers.signing_status IS 'Candidate signing lifecycle after send; complements offers.status.';
COMMENT ON COLUMN public.offers.document_content IS 'Frozen HTML shown to the candidate at send time.';
COMMENT ON COLUMN public.offers.document_hash IS 'SHA-256 (hex) of document_content at send time.';

-- Remove DocuSign / provider columns (native signing only).
ALTER TABLE public.offers DROP COLUMN IF EXISTS esign_provider;
ALTER TABLE public.offers DROP COLUMN IF EXISTS esign_envelope_id;
ALTER TABLE public.offers DROP COLUMN IF EXISTS esign_status;
ALTER TABLE public.offers DROP COLUMN IF EXISTS esign_sent_at;
ALTER TABLE public.offers DROP COLUMN IF EXISTS esign_signed_at;
ALTER TABLE public.offers DROP COLUMN IF EXISTS esign_document_url;

DROP INDEX IF EXISTS idx_offers_esign_envelope_id;

CREATE TYPE public.offer_event_type AS ENUM (
  'sent',
  'viewed',
  'signed',
  'declined',
  'expired',
  'reminder_sent',
  'downloaded'
);

CREATE TABLE IF NOT EXISTS public.offer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers (id) ON DELETE CASCADE,
  event_type public.offer_event_type NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_ip text,
  actor_user_agent text,
  actor_name text,
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS idx_offer_events_offer_occurred
  ON public.offer_events (offer_id, occurred_at DESC);

ALTER TABLE public.offer_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offer_events_org_read ON public.offer_events;
CREATE POLICY offer_events_org_read
  ON public.offer_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.offers o
      WHERE o.id = offer_events.offer_id
        AND o.organisation_id = public.auth_organisation_id()
        AND public.auth_role() IN (
          'company_admin',
          'recruiter',
          'hiring_manager',
          'finance',
          'super_admin'
        )
    )
  );

DROP POLICY IF EXISTS offer_events_super_admin_read ON public.offer_events;
CREATE POLICY offer_events_super_admin_read
  ON public.offer_events
  FOR SELECT
  USING (public.auth_role() = 'super_admin');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'placement_fee_billing_events'
  ) THEN
    ALTER TABLE public.placement_fee_billing_events
      ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES public.offers (id) ON DELETE SET NULL;
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signed-offers',
  'signed-offers',
  false,
  52428800,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
