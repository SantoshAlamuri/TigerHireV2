-- Cross-tenant routing fix: make the WhatsApp session org-aware.
--
-- Problem: an inbound WhatsApp reply was routed purely by phone. When the same
-- phone is an active candidate in two organisations, replies/screening could be
-- routed to the wrong org ("most recently created wins"), so the wrong org
-- captured the candidate's answers / the candidate saw the wrong org's job.
--
-- This adds an optional `organisation_id` to `whatsapp_sessions` so the resolved
-- org for a thread can be persisted and reused to keep subsequent replies on the
-- same org's thread. It is nullable and best-effort: routing does not require it,
-- but uses it as a stickiness signal when present.
--
-- DDL only — review before applying. Do NOT auto-apply to production.

BEGIN;

ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES public.organisations (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.whatsapp_sessions.organisation_id IS
  'Best-effort org this thread is currently engaged with (e.g. the screening_job org that last replied). Used to keep inbound routing org-consistent when the same phone is active in multiple orgs. Nullable.';

-- Lookup support: routing reads the session by phone; the org is read alongside.
-- (phone is already the primary lookup key.) Index on org for admin/debug queries.
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_organisation_id
  ON public.whatsapp_sessions (organisation_id)
  WHERE organisation_id IS NOT NULL;

COMMIT;
