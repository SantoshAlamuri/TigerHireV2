ALTER TABLE public.referrals
ADD COLUMN IF NOT EXISTS target_phone text;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_target_phone_created_at
  ON public.referrals (referrer_id, target_phone, created_at DESC)
  WHERE target_phone IS NOT NULL;
