-- Custom merge field definitions on PDF templates + per-offer values at send time.

BEGIN;

ALTER TABLE public.offer_pdf_templates
  ADD COLUMN IF NOT EXISTS custom_merge_field_defs jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.offer_pdf_templates.custom_merge_field_defs IS
  'JSON array of {key, label, description?}; keys become {{key}} in the template body.';

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS letter_variables jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.offers.letter_variables IS
  'String values for custom template merge keys; keys must match org template custom_merge_field_defs.';

COMMIT;
