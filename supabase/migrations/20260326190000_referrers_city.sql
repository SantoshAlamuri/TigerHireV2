-- Optional city for referrer-facing social proof (e.g. payout ticker). Safe if column already exists.
ALTER TABLE public.referrers ADD COLUMN IF NOT EXISTS city text;

COMMENT ON COLUMN public.referrers.city IS 'Optional city for public leaderboard display';
