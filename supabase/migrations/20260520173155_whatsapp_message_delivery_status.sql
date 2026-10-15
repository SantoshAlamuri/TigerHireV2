-- Track Meta webhook delivery status (sent / delivered / read / failed) per outbound wamid.

BEGIN;

ALTER TABLE public.whatsapp_message_log
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS delivery_error text,
  ADD COLUMN IF NOT EXISTS delivery_updated_at timestamptz;

COMMENT ON COLUMN public.whatsapp_message_log.delivery_status IS
  'Meta statuses webhook: sent, delivered, read, failed (latest wins per wamid).';
COMMENT ON COLUMN public.whatsapp_message_log.delivery_error IS
  'First error title/message from Meta when delivery_status = failed.';

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_log_wa_message_id
  ON public.whatsapp_message_log (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS last_outreach_delivery_status text,
  ADD COLUMN IF NOT EXISTS last_outreach_delivery_error text,
  ADD COLUMN IF NOT EXISTS last_outreach_delivery_at timestamptz;

COMMENT ON COLUMN public.referrals.last_outreach_delivery_status IS
  'Latest Meta delivery status for referral WhatsApp invite to target_phone.';

COMMIT;
