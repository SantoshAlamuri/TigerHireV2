-- Platform-wide cost ledger for Super Admin spend visibility.

CREATE TABLE platform_price_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  service text NOT NULL,
  metric_key text NOT NULL,
  unit text NOT NULL,
  price_usd numeric(18, 8) NOT NULL CHECK (price_usd >= 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_price_catalog_time_window CHECK (
    effective_to IS NULL OR effective_to > effective_from
  )
);

CREATE UNIQUE INDEX idx_platform_price_catalog_unique
  ON platform_price_catalog (provider, service, metric_key, effective_from);
CREATE INDEX idx_platform_price_catalog_lookup
  ON platform_price_catalog (provider, service, metric_key, effective_from DESC);

CREATE TABLE platform_cost_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  service text NOT NULL,
  category text NOT NULL DEFAULT 'inference',
  external_id text NOT NULL,
  organisation_id uuid REFERENCES organisations (id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL,
  quantity numeric(22, 8) NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'unit',
  amount_usd numeric(18, 8) NOT NULL CHECK (amount_usd >= 0),
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'estimated',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_cost_events_external_unique UNIQUE (provider, external_id)
);

CREATE INDEX idx_platform_cost_events_occurred_at
  ON platform_cost_events (occurred_at DESC);
CREATE INDEX idx_platform_cost_events_provider_service
  ON platform_cost_events (provider, service, occurred_at DESC);
CREATE INDEX idx_platform_cost_events_org_id
  ON platform_cost_events (organisation_id, occurred_at DESC);

CREATE OR REPLACE VIEW platform_cost_daily
WITH (security_invoker = true)
AS
SELECT
  date_trunc('day', occurred_at) AS bucket_day,
  provider,
  service,
  status,
  currency,
  SUM(amount_usd) AS amount_usd,
  SUM(quantity) AS quantity,
  COUNT(*) AS events_count
FROM platform_cost_events
GROUP BY 1, 2, 3, 4, 5;

-- Seed baseline pricing for Anthropic model families (USD / 1K tokens).
INSERT INTO platform_price_catalog (provider, service, metric_key, unit, price_usd, metadata)
VALUES
  ('anthropic', 'messages', 'claude-sonnet-input-1k', 'tokens', 0.003, '{"model_family":"sonnet","direction":"input"}'::jsonb),
  ('anthropic', 'messages', 'claude-sonnet-output-1k', 'tokens', 0.015, '{"model_family":"sonnet","direction":"output"}'::jsonb),
  ('anthropic', 'messages', 'claude-opus-input-1k', 'tokens', 0.005, '{"model_family":"opus","direction":"input"}'::jsonb),
  ('anthropic', 'messages', 'claude-opus-output-1k', 'tokens', 0.025, '{"model_family":"opus","direction":"output"}'::jsonb),
  ('anthropic', 'messages', 'claude-haiku-input-1k', 'tokens', 0.001, '{"model_family":"haiku","direction":"input"}'::jsonb),
  ('anthropic', 'messages', 'claude-haiku-output-1k', 'tokens', 0.005, '{"model_family":"haiku","direction":"output"}'::jsonb);
