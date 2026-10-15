-- Per-link active flag: agency can soft-disable a client without removing the organisation.
-- Requires RLS UPDATE policies (none existed on agency_clients before).

ALTER TABLE agency_clients
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN agency_clients.is_active IS 'When false, the agency cannot access this client''s jobs/candidates until reactivated.';

DROP POLICY IF EXISTS "Agency can update own client links" ON agency_clients;
CREATE POLICY "Agency can update own client links"
  ON agency_clients FOR UPDATE
  USING (
    agency_organisation_id = public.auth_organisation_id()
    AND public.auth_role() = 'agency'
  )
  WITH CHECK (
    agency_organisation_id = public.auth_organisation_id()
    AND public.auth_role() = 'agency'
  );

DROP POLICY IF EXISTS "Super admins can update agency_clients" ON agency_clients;
CREATE POLICY "Super admins can update agency_clients"
  ON agency_clients FOR UPDATE
  USING (public.auth_role() = 'super_admin')
  WITH CHECK (public.auth_role() = 'super_admin');
