-- Organisations: companies and agencies. Companies post JDs; agencies manage multiple clients.

CREATE TABLE organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type organisation_type NOT NULL,
  name text NOT NULL,
  slug text,
  approval organisation_approval NOT NULL DEFAULT 'approved',
  -- Billing (company plans)
  company_plan company_plan NOT NULL DEFAULT 'starter',
  stripe_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organisations_slug_unique UNIQUE (slug)
);

CREATE INDEX idx_organisations_type ON organisations (type);
CREATE INDEX idx_organisations_approval ON organisations (approval) WHERE approval = 'pending';
CREATE INDEX idx_organisations_slug ON organisations (slug) WHERE slug IS NOT NULL;

COMMENT ON TABLE organisations IS 'Companies (hire) and agencies (RPO; multiple clients). Agency approval required before access.';
