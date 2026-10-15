-- Agency–client relationship: an agency org can manage hiring for multiple client orgs.
-- Enables agency dashboard to list clients, share apply links, and see pipeline per client.

CREATE TABLE agency_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  client_organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agency_clients_unique UNIQUE (agency_organisation_id, client_organisation_id),
  CONSTRAINT agency_clients_not_self CHECK (agency_organisation_id != client_organisation_id)
);

CREATE INDEX idx_agency_clients_agency ON agency_clients (agency_organisation_id);
CREATE INDEX idx_agency_clients_client ON agency_clients (client_organisation_id);

COMMENT ON TABLE agency_clients IS 'Links an agency organisation to client organisations whose hiring they manage.';
