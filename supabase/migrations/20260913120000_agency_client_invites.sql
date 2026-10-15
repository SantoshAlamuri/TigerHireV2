-- Company-initiated consultant (agency) invites.
--
-- Until now the only way an agency and a company could be linked was the agency
-- inserting an `agency_clients` row for itself (POST /api/agency/clients). There
-- was no outbound direction: a company could not invite a consulting firm it
-- already works with, and the firm's side of the relationship was never asked.
--
-- This table adds the company -> consultant direction as an explicit, expiring,
-- revocable invite. Accepting it is what creates the `agency_clients` link, so a
-- link created this way carries consent from BOTH sides.
--
-- This migration is deliberately ADDITIVE: it does not change the existing
-- agency-initiated path or any agency_clients policy. The consent gap on that
-- path is tracked separately (see issue #373).

CREATE TABLE IF NOT EXISTS public.agency_client_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  -- Resolved when a specific agency org is known (either the invited email already
  -- belongs to an agency user, or on acceptance). NULL while the invite is open.
  agency_organisation_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  -- Display hint typed by the inviter ("Acme Talent"), shown on the accept page.
  invited_agency_name text,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.agency_client_invites IS
  'Company-initiated invites for an external consulting firm (agency org) to work on the company''s roles. Accepting creates the agency_clients link, so links made this way are two-party.';
COMMENT ON COLUMN public.agency_client_invites.agency_organisation_id IS
  'The agency org that accepted (or was pre-resolved from the invited email). NULL while pending and unresolved.';

-- One open invite per email per company. Accepted/revoked rows stay as history.
CREATE UNIQUE INDEX IF NOT EXISTS agency_client_invites_pending_unique
  ON public.agency_client_invites (company_organisation_id, lower(invited_email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS agency_client_invites_company_idx
  ON public.agency_client_invites (company_organisation_id, status);

CREATE INDEX IF NOT EXISTS agency_client_invites_agency_idx
  ON public.agency_client_invites (agency_organisation_id)
  WHERE agency_organisation_id IS NOT NULL;

ALTER TABLE public.agency_client_invites ENABLE ROW LEVEL SECURITY;

-- Read: the inviting company's staff, the agency once it is resolved, super_admin.
-- Token lookup for the (pre-auth) accept page goes through the service role in the
-- route, exactly as /api/invites/[token] does — the token is never exposed here.
DROP POLICY IF EXISTS agency_client_invites_select ON public.agency_client_invites;
CREATE POLICY agency_client_invites_select
  ON public.agency_client_invites FOR SELECT
  USING (
    (SELECT public.auth_role()) = 'super_admin'::public.app_role
    OR (
      company_organisation_id = (SELECT public.auth_organisation_id())
      AND (SELECT public.auth_role()) IN (
        'leadership'::public.app_role,
        'recruiter'::public.app_role
      )
    )
    OR (
      agency_organisation_id IS NOT NULL
      AND agency_organisation_id = (SELECT public.auth_organisation_id())
      AND (SELECT public.auth_role()) = 'agency'::public.app_role
    )
  );

-- Write: only the inviting company's leadership (or super_admin). Note the
-- WITH CHECK pins company_organisation_id to the caller's own org, so a company
-- cannot create an invite that appears to come from someone else.
DROP POLICY IF EXISTS agency_client_invites_insert ON public.agency_client_invites;
CREATE POLICY agency_client_invites_insert
  ON public.agency_client_invites FOR INSERT
  WITH CHECK (
    (SELECT public.auth_role()) = 'super_admin'::public.app_role
    OR (
      company_organisation_id = (SELECT public.auth_organisation_id())
      AND (SELECT public.auth_role()) = 'leadership'::public.app_role
    )
  );

DROP POLICY IF EXISTS agency_client_invites_update ON public.agency_client_invites;
CREATE POLICY agency_client_invites_update
  ON public.agency_client_invites FOR UPDATE
  USING (
    (SELECT public.auth_role()) = 'super_admin'::public.app_role
    OR (
      company_organisation_id = (SELECT public.auth_organisation_id())
      AND (SELECT public.auth_role()) = 'leadership'::public.app_role
    )
  )
  WITH CHECK (
    (SELECT public.auth_role()) = 'super_admin'::public.app_role
    OR (
      company_organisation_id = (SELECT public.auth_organisation_id())
      AND (SELECT public.auth_role()) = 'leadership'::public.app_role
    )
  );
