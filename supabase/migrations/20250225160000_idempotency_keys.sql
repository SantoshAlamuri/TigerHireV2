-- Idempotency keys: store first response per key to avoid duplicate mutations (payments, apply, etc.).
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash text NOT NULL,
  endpoint text NOT NULL,
  response_status int NOT NULL,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key_hash, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys (created_at);

COMMENT ON TABLE idempotency_keys IS 'Stores first response per idempotency key; duplicate requests return stored response. key_hash = hash(Idempotency-Key header). TTL cleanup can be added later (e.g. delete where created_at < now() - 24h).';
