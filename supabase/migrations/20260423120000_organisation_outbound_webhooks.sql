-- Customer outbound webhooks: org-registered URLs that receive HMAC-signed JSON for HRIS / automation.
BEGIN;

CREATE TABLE IF NOT EXISTS public.organisation_outbound_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  name text,
  target_url text NOT NULL
    CHECK (char_length(btrim(target_url)) > 0),
  -- HMAC key (treat as secret; only returned in full on create)
  signing_secret text NOT NULL
    CHECK (char_length(btrim(signing_secret)) >= 32),
  -- e.g. '*' for all, or 'application.submitted', 'offer.accepted'
  event_types text[] NOT NULL DEFAULT ARRAY['*']::text[]
    CHECK (array_length(event_types, 1) IS NOT NULL AND array_length(event_types, 1) > 0),
  is_enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbound_webhooks_org_enabled
  ON public.organisation_outbound_webhooks (organisation_id, is_enabled)
  WHERE is_enabled = true;

ALTER TABLE public.organisation_outbound_webhooks ENABLE ROW LEVEL SECURITY;

-- Read: org staff on same org (no secret in list response — API masks)
CREATE POLICY "outbound webhooks org select"
  ON public.organisation_outbound_webhooks
  FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN (
      'company_admin',
      'recruiter',
      'hiring_manager',
      'finance',
      'super_admin'
    )
  );

CREATE POLICY "outbound webhooks org write"
  ON public.organisation_outbound_webhooks
  FOR ALL
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'super_admin')
  )
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'super_admin')
  );

COMMENT ON TABLE public.organisation_outbound_webhooks IS
  'Org-configured URLs for signed outbound JSON (HRIS, Zapier, etc.); deliver via Inngest.';

COMMIT;
