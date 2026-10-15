-- RLS for agency_clients: only agency (and super_admin) can manage their client links.
-- Run after 72_agency_clients.sql. Safe to re-run (drops policies first).

ALTER TABLE agency_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency can read own client links" ON agency_clients;
DROP POLICY IF EXISTS "Super admins can read agency_clients" ON agency_clients;
DROP POLICY IF EXISTS "Agency can add clients for own org" ON agency_clients;
DROP POLICY IF EXISTS "Agency can delete own client links" ON agency_clients;
DROP POLICY IF EXISTS "Super admins can insert agency_clients" ON agency_clients;
DROP POLICY IF EXISTS "Super admins can delete agency_clients" ON agency_clients;

-- Agency can read only their own client links
CREATE POLICY "Agency can read own client links"
  ON agency_clients FOR SELECT
  USING (
    agency_organisation_id = public.auth_organisation_id()
    AND public.auth_role() = 'agency'
  );

-- Super admins can read all
CREATE POLICY "Super admins can read agency_clients"
  ON agency_clients FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- Agency can insert only for their own org
CREATE POLICY "Agency can add clients for own org"
  ON agency_clients FOR INSERT
  WITH CHECK (
    agency_organisation_id = public.auth_organisation_id()
    AND public.auth_role() = 'agency'
  );

-- Agency can delete their own client links (remove a client)
CREATE POLICY "Agency can delete own client links"
  ON agency_clients FOR DELETE
  USING (
    agency_organisation_id = public.auth_organisation_id()
    AND public.auth_role() = 'agency'
  );

-- Super admins can manage all (for support)
CREATE POLICY "Super admins can insert agency_clients"
  ON agency_clients FOR INSERT
  WITH CHECK (public.auth_role() = 'super_admin');

CREATE POLICY "Super admins can delete agency_clients"
  ON agency_clients FOR DELETE
  USING (public.auth_role() = 'super_admin');
