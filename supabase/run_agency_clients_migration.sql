-- Run this in Supabase Dashboard > SQL Editor to create agency_clients and apply RLS.
-- Idempotent: safe to run once; re-running 73 will replace policies.

-- ========== 72: Table ==========
CREATE TABLE IF NOT EXISTS agency_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  client_organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agency_clients_unique UNIQUE (agency_organisation_id, client_organisation_id),
  CONSTRAINT agency_clients_not_self CHECK (agency_organisation_id != client_organisation_id)
);

CREATE INDEX IF NOT EXISTS idx_agency_clients_agency ON agency_clients (agency_organisation_id);
CREATE INDEX IF NOT EXISTS idx_agency_clients_client ON agency_clients (client_organisation_id);

COMMENT ON TABLE agency_clients IS 'Links an agency organisation to client organisations whose hiring they manage.';

-- ========== 73: RLS ==========
ALTER TABLE agency_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency can read own client links" ON agency_clients;
DROP POLICY IF EXISTS "Super admins can read agency_clients" ON agency_clients;
DROP POLICY IF EXISTS "Agency can add clients for own org" ON agency_clients;
DROP POLICY IF EXISTS "Agency can delete own client links" ON agency_clients;
DROP POLICY IF EXISTS "Super admins can insert agency_clients" ON agency_clients;
DROP POLICY IF EXISTS "Super admins can delete agency_clients" ON agency_clients;

CREATE POLICY "Agency can read own client links"
  ON agency_clients FOR SELECT
  USING (
    agency_organisation_id = public.auth_organisation_id()
    AND public.auth_role() = 'agency'
  );

CREATE POLICY "Super admins can read agency_clients"
  ON agency_clients FOR SELECT
  USING (public.auth_role() = 'super_admin');

CREATE POLICY "Agency can add clients for own org"
  ON agency_clients FOR INSERT
  WITH CHECK (
    agency_organisation_id = public.auth_organisation_id()
    AND public.auth_role() = 'agency'
  );

CREATE POLICY "Agency can delete own client links"
  ON agency_clients FOR DELETE
  USING (
    agency_organisation_id = public.auth_organisation_id()
    AND public.auth_role() = 'agency'
  );

CREATE POLICY "Super admins can insert agency_clients"
  ON agency_clients FOR INSERT
  WITH CHECK (public.auth_role() = 'super_admin');

CREATE POLICY "Super admins can delete agency_clients"
  ON agency_clients FOR DELETE
  USING (public.auth_role() = 'super_admin');
