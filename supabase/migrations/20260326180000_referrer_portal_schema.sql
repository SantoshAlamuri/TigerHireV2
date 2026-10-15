-- Referrer portal: link referrers to auth users, verification flags, candidate type, OTP table, job config toggles.

-- ---------------------------------------------------------------------------
-- 1) referrers — user link, lifecycle, WhatsApp verification, optional candidate
-- ---------------------------------------------------------------------------

ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS whatsapp_verified boolean NOT NULL DEFAULT false;

ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS candidate_id uuid REFERENCES public.candidates (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'referrers'
      AND c.conname = 'referrers_status_check'
  ) THEN
    ALTER TABLE public.referrers
      ADD CONSTRAINT referrers_status_check
      CHECK (status IN ('pending', 'active', 'suspended'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_referrers_user_id_unique
  ON public.referrers (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.referrers.user_id IS 'Supabase Auth user linked to this referrer (nullable until claimed / verified).';
COMMENT ON COLUMN public.referrers.status IS 'Referrer lifecycle: pending | active | suspended.';
COMMENT ON COLUMN public.referrers.whatsapp_verified IS 'True once WhatsApp OTP (or equivalent) succeeds.';
COMMENT ON COLUMN public.referrers.candidate_id IS 'Optional link to candidates row when type is candidate-referrer.';

-- ---------------------------------------------------------------------------
-- 1b) Expand referrers.type CHECK to include candidate (drop legacy check by name)
-- ---------------------------------------------------------------------------

ALTER TABLE public.referrers DROP CONSTRAINT IF EXISTS referrers_type_check;

ALTER TABLE public.referrers
  ADD CONSTRAINT referrers_type_check
  CHECK (type IN ('employee', 'freelancer', 'agency', 'candidate'));

COMMENT ON COLUMN public.referrers.type IS 'employee | freelancer | agency | candidate';

COMMENT ON TABLE public.referrers IS 'Referral identity: type employee | freelancer | agency | candidate; optional parent for second-level attribution.';

-- ---------------------------------------------------------------------------
-- 2) job_referral_config — candidate-as-referrer + optional future vouch incentive
-- ---------------------------------------------------------------------------

ALTER TABLE public.job_referral_config
  ADD COLUMN IF NOT EXISTS candidate_referrer_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.job_referral_config
  ADD COLUMN IF NOT EXISTS candidate_referrer_bonus_amount numeric(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.job_referral_config
  ADD COLUMN IF NOT EXISTS vouch_bonus_amount numeric(10, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.job_referral_config.candidate_referrer_enabled IS 'When true, hired/placed candidates may refer others for this job under configured rules.';
COMMENT ON COLUMN public.job_referral_config.candidate_referrer_bonus_amount IS 'Bonus amount for candidate-referrer milestone when enabled.';
COMMENT ON COLUMN public.job_referral_config.vouch_bonus_amount IS 'Optional bonus paid when referrer submits a vouch — 0 means no vouch bonus.';

-- ---------------------------------------------------------------------------
-- 3) referrer_otp — WhatsApp (or SMS) OTP verification; no RLS (server-only access)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.referrer_otp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number text NOT NULL,
  otp_code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrer_otp_whatsapp_number ON public.referrer_otp (whatsapp_number);

COMMENT ON TABLE public.referrer_otp IS 'One-time codes for verifying referrer WhatsApp numbers; consumed at verify time.';
COMMENT ON COLUMN public.referrer_otp.whatsapp_number IS 'Normalized or raw WhatsApp number the OTP was sent to.';
COMMENT ON COLUMN public.referrer_otp.otp_code IS 'OTP value (store hashed in app layer if required; plain here for MVP).';
COMMENT ON COLUMN public.referrer_otp.expires_at IS 'OTP invalid after this time.';
COMMENT ON COLUMN public.referrer_otp.used_at IS 'Set when OTP is successfully consumed.';
