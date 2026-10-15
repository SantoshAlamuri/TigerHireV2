-- Per-delivery log for HMAC fan-out (DLQ = failed rows; admin replay reuses stored payload)
BEGIN;

CREATE TABLE IF NOT EXISTS public.outbound_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  outbound_webhook_id uuid NOT NULL REFERENCES public.organisation_outbound_webhooks (id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (char_length(btrim(event_type)) > 0),
  -- Inner `data` of the JSON envelope; may be stored truncated (see app layer)
  payload_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_status text NOT NULL
    CHECK (delivery_status IN ('success', 'failed')),
  http_status int,
  error_message text,
  attempt_number int NOT NULL DEFAULT 1
    CHECK (attempt_number > 0),
  replay_of uuid REFERENCES public.outbound_webhook_deliveries (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbound_webhook_deliveries_org_created
  ON public.outbound_webhook_deliveries (organisation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbound_webhook_deliveries_hook_created
  ON public.outbound_webhook_deliveries (outbound_webhook_id, created_at DESC)
  WHERE delivery_status = 'failed';

COMMENT ON TABLE public.outbound_webhook_deliveries IS
  'One row per HTTP attempt to a customer outbound webhook; failed rows are visible as DLQ and may be replayed.';

ALTER TABLE public.outbound_webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outbound webhook deliveries org select"
  ON public.outbound_webhook_deliveries
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

-- Inserts/updates: service role (Inngest + admin replay API) only; no end-user direct writes.

COMMIT;
