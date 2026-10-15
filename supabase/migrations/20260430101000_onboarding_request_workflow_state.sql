BEGIN;

ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS onboarding_company_id uuid REFERENCES public.organisations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarding_admin_payload jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_approved_by text;

ALTER TABLE public.contact_submissions
  DROP CONSTRAINT IF EXISTS contact_submissions_onboarding_status_check;

ALTER TABLE public.contact_submissions
  ADD CONSTRAINT contact_submissions_onboarding_status_check
  CHECK (
    onboarding_status IS NULL
    OR onboarding_status IN ('pending', 'approved', 'handled')
  );

COMMIT;
