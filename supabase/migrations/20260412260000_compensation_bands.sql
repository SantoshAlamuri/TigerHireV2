-- B7: Evolve compensation_bands stub → configurable bands; offer band fields; approval token type.

BEGIN;

-- ─── 1. Migrate stub table (20260412140000) to B7 column model ───
ALTER TABLE public.compensation_bands RENAME COLUMN min_ctc TO min_amount;
ALTER TABLE public.compensation_bands RENAME COLUMN max_ctc TO max_amount;
ALTER TABLE public.compensation_bands RENAME COLUMN role_level TO label;

ALTER TABLE public.compensation_bands
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.compensation_bands SET currency = 'INR' WHERE currency IS NULL OR currency = '';
ALTER TABLE public.compensation_bands ALTER COLUMN currency SET NOT NULL;

ALTER TABLE public.compensation_bands DROP COLUMN IF EXISTS department;
ALTER TABLE public.compensation_bands DROP COLUMN IF EXISTS location_key;
ALTER TABLE public.compensation_bands DROP COLUMN IF EXISTS effective_from;

ALTER TABLE public.compensation_bands
  ALTER COLUMN min_amount TYPE numeric(15, 2) USING round(min_amount::numeric, 2),
  ALTER COLUMN max_amount TYPE numeric(15, 2) USING round(max_amount::numeric, 2);

ALTER TABLE public.compensation_bands DROP CONSTRAINT IF EXISTS compensation_bands_min_lt_max;
ALTER TABLE public.compensation_bands
  ADD CONSTRAINT compensation_bands_min_lt_max CHECK (min_amount < max_amount);

DROP INDEX IF EXISTS idx_compensation_bands_org;
CREATE INDEX IF NOT EXISTS idx_compensation_bands_org_active
  ON public.compensation_bands (organisation_id, is_active);

COMMENT ON TABLE public.compensation_bands IS 'B7: org-defined pay bands for offer validation.';

DROP TRIGGER IF EXISTS compensation_bands_updated_at ON public.compensation_bands;
CREATE TRIGGER compensation_bands_updated_at
  BEFORE UPDATE ON public.compensation_bands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "compensation bands org read" ON public.compensation_bands;
DROP POLICY IF EXISTS "compensation bands org admin write" ON public.compensation_bands;

CREATE POLICY "compensation bands org read"
  ON public.compensation_bands FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN (
      'company_admin', 'recruiter', 'hiring_manager', 'finance', 'super_admin'
    )
  );

CREATE POLICY "compensation bands company admin insert"
  ON public.compensation_bands FOR INSERT
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'super_admin')
  );

CREATE POLICY "compensation bands org update"
  ON public.compensation_bands FOR UPDATE
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'super_admin')
  )
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'super_admin')
  );

-- ─── 2. Offers band tracking ───
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS band_id uuid REFERENCES public.compensation_bands (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS band_exception_reason text,
  ADD COLUMN IF NOT EXISTS band_status text,
  ADD COLUMN IF NOT EXISTS band_checked_at timestamptz;

COMMENT ON COLUMN public.offers.band_status IS 'B7: within_band | exception_pending | exception_approved | exception_rejected | no_band | bands_disabled';

CREATE INDEX IF NOT EXISTS idx_offers_band_status ON public.offers (organisation_id, band_status)
  WHERE band_status IS NOT NULL;

-- ─── 3. Approval token subtype ───
ALTER TABLE public.approval_tokens
  ADD COLUMN IF NOT EXISTS approval_type text NOT NULL DEFAULT 'finance';

ALTER TABLE public.approval_tokens DROP CONSTRAINT IF EXISTS approval_tokens_approval_type_check;
ALTER TABLE public.approval_tokens
  ADD CONSTRAINT approval_tokens_approval_type_check
  CHECK (approval_type IN ('finance', 'band_exception'));

COMMENT ON COLUMN public.approval_tokens.approval_type IS 'finance = offer finance gate; band_exception = comp band override.';

COMMIT;
