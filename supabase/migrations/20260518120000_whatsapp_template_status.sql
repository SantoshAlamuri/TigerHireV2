-- Track WhatsApp message template lifecycle from Meta API submit + message_template_status_update webhooks.

BEGIN;

CREATE TABLE public.whatsapp_template_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  waba_id text,
  meta_template_id bigint,
  status text NOT NULL,
  category text,
  rejection_reason text,
  last_event text,
  submitted_at timestamptz,
  status_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_template_status_name_lang_unique UNIQUE (template_name, language)
);

CREATE INDEX idx_whatsapp_template_status_status ON public.whatsapp_template_status (status);
CREATE INDEX idx_whatsapp_template_status_updated ON public.whatsapp_template_status (status_updated_at DESC);

COMMENT ON TABLE public.whatsapp_template_status IS
  'Meta WABA template approval state. Updated on API submit and message_template_status_update webhooks.';

ALTER TABLE public.whatsapp_template_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_template_status_select_super_admin ON public.whatsapp_template_status
  FOR SELECT
  USING ((SELECT public.auth_role()) = 'super_admin');

-- Inserts/updates only via service role (webhooks, admin API, scripts).

COMMIT;
