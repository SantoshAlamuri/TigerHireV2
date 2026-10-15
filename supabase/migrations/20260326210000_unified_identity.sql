-- Unified referrer identity: collapse employee/freelancer into individual.

-- Must run UPDATE before tightening CHECK — employee/freelancer must remain valid until rows are migrated.
UPDATE public.referrers
SET type = 'individual'
WHERE type IN ('employee', 'freelancer');

ALTER TABLE public.referrers DROP CONSTRAINT IF EXISTS referrers_type_check;

ALTER TABLE public.referrers
  ADD CONSTRAINT referrers_type_check
  CHECK (type IN ('individual', 'agency', 'candidate'));

COMMENT ON COLUMN public.referrers.type IS 'individual | agency | candidate';

COMMENT ON TABLE public.referrers IS 'Referral identity: type individual | agency | candidate; optional parent for second-level attribution.';
