BEGIN;

ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS onboarding_activity jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.contact_submissions
  DROP CONSTRAINT IF EXISTS contact_submissions_onboarding_status_check;

ALTER TABLE public.contact_submissions
  ADD CONSTRAINT contact_submissions_onboarding_status_check
  CHECK (
    onboarding_status IS NULL
    OR onboarding_status IN ('pending', 'approved', 'handled', 'cancelled')
  );

COMMIT;
