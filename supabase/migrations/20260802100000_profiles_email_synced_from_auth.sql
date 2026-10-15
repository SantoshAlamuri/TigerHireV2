-- profiles.email: twelve code paths select it and it has never existed.
--
-- Interview reminders, cancellations, reschedules, feedback follow-ups, offer
-- approvals, band-exception approvals, scheduling follow-ups, plan-stage
-- dispatch, interviewer availability and support requests all do
-- `.from("profiles").select("... email ...")`. PostgREST rejects the whole
-- select, the caller reads null, and the recipient address comes out empty — so
-- effectively no internal transactional email has been addressable.
--
-- Adding the column beats rewriting twelve call sites: the code was written
-- against this shape, and each hand-rewrite is a fresh chance to break a
-- notification path nobody is currently watching.
--
-- Disclosure: profiles_select scopes reads to the caller's OWN organisation
-- (auth_organisation_id(), singular — not the agency-expanding array), so this
-- exposes a colleague's work email to colleagues, on exactly the same terms as
-- the phone column already there. No cross-tenant exposure.
--
-- Applied to Sydney preview and prod Mumbai 2026-08-02 on operator approval.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN public.profiles.email IS
  'Mirror of auth.users.email, kept in sync by trigger. Read-only for application code — auth.users remains the source of truth.';

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id AND p.email IS DISTINCT FROM u.email;

CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_profile_email ON auth.users;
CREATE TRIGGER trg_sync_profile_email
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_email_from_auth();
