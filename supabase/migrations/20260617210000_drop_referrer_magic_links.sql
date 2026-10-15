-- Drop dead `referrer_magic_links` table. No code paths read or write it
-- (created 20260326201000 for a WhatsApp-magic-link login flow that was
-- never wired up — referrer auth ships via `referrer_otp` instead).
-- CASCADE removes the RLS deny policy added in 20260418221000.

DROP TABLE IF EXISTS public.referrer_magic_links CASCADE;
