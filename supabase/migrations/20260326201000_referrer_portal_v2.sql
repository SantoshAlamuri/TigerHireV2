-- Referrer portal v2: optional profile fields + WhatsApp magic-link login tokens.
-- Note: `city` may already exist from 20260326190000_referrers_city.sql; ADD COLUMN IF NOT EXISTS is safe.

ALTER TABLE public.referrers ADD COLUMN IF NOT EXISTS city text;
COMMENT ON COLUMN public.referrers.city IS 'City for public leaderboard display';

ALTER TABLE public.referrers ADD COLUMN IF NOT EXISTS linkedin_url text;
COMMENT ON COLUMN public.referrers.linkedin_url IS 'LinkedIn profile URL';

CREATE TABLE IF NOT EXISTS public.referrer_magic_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.referrers (id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- UNIQUE(token) creates a btree index on token; explicit index on referrer_id for lookups.
CREATE INDEX IF NOT EXISTS idx_referrer_magic_links_referrer_id
  ON public.referrer_magic_links (referrer_id);

COMMENT ON TABLE public.referrer_magic_links IS 'WhatsApp magic link tokens for passwordless referrer login';
