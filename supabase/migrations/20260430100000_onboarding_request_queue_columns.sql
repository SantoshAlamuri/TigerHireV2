BEGIN;

ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS onboarding_domain text,
  ADD COLUMN IF NOT EXISTS onboarding_role_title text,
  ADD COLUMN IF NOT EXISTS onboarding_status text,
  ADD COLUMN IF NOT EXISTS onboarding_handled_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_handled_by text,
  ADD COLUMN IF NOT EXISTS onboarding_handled_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contact_submissions_onboarding_status_check'
  ) THEN
    ALTER TABLE public.contact_submissions
      ADD CONSTRAINT contact_submissions_onboarding_status_check
      CHECK (onboarding_status IS NULL OR onboarding_status IN ('pending', 'handled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contact_submissions_onboarding_status_created_at
  ON public.contact_submissions (onboarding_status, created_at DESC)
  WHERE onboarding_status IS NOT NULL;

COMMENT ON COLUMN public.contact_submissions.onboarding_status IS
  'Queue state for enterprise onboarding requests. Null for generic contact submissions.';

COMMIT;
