-- Persist per-user dismissal of UI hint banners server-side.
--
-- The company-setup welcome banner stored its "hide this" state only in localStorage, which is
-- browser-local and easily lost (incognito, cleared site data, a different device), so it kept
-- reappearing across logins. `dismissed_hints` holds opaque hint keys (e.g. 'company_setup_welcome')
-- so a dismissal sticks for the user everywhere. Writes go through the service-role admin client
-- scoped to the authenticated user's own row, so no extra RLS policy is required.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dismissed_hints text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.profiles.dismissed_hints IS
  'Opaque UI-hint keys this user has permanently dismissed (e.g. company_setup_welcome).';
