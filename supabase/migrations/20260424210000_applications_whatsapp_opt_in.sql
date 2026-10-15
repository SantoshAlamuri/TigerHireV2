-- Public apply: candidate opted in to WhatsApp at apply time (launch P2).
BEGIN;
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean;
COMMENT ON COLUMN public.applications.whatsapp_opt_in IS
  'When true, candidate consented to WhatsApp at apply; when false, skipped; null = legacy/unknown.';
COMMIT;
