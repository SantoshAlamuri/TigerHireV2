-- Offer template assignment rules for auto-selection in offer draft.

BEGIN;

ALTER TABLE public.offer_pdf_templates
  ADD COLUMN IF NOT EXISTS selection_rules jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.offer_pdf_templates.selection_rules IS
  'Template auto-assignment rules. Keys: roleTitleContains[], locations[], employmentTypes[], seniorityLevels[]';

COMMIT;
