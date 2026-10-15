ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS work_email text NULL;

ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS verified_org_id uuid NULL REFERENCES organisations(id) ON DELETE SET NULL;

ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS org_verified boolean NOT NULL DEFAULT false;

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS email_domain text NULL;

COMMENT ON COLUMN public.organisations.email_domain IS
  'Email domain for verified employee referrer matching e.g. enate.ai';

ALTER TABLE public.job_referral_config
  ADD COLUMN IF NOT EXISTS employee_bonus_amount numeric(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.job_referral_config.employee_bonus_amount IS
  'Bonus for verified org employee referrers - overrides direct_bonus_amount when > 0';

CREATE INDEX IF NOT EXISTS idx_organisations_email_domain
  ON public.organisations(email_domain);
