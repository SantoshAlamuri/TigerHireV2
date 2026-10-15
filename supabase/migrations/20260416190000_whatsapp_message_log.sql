-- Short previews of WhatsApp traffic for platform admin (not a full legal archive of raw webhooks).

CREATE TABLE public.whatsapp_message_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  wa_message_id text,
  message_type text NOT NULL,
  body_preview text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_message_log_phone_created
  ON public.whatsapp_message_log (phone, created_at DESC);

COMMENT ON TABLE public.whatsapp_message_log IS 'Inbound/outbound WhatsApp previews for admin session UI; body_preview is truncated plain text or a short description.';
