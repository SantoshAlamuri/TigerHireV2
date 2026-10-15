-- Dead letter queue for failed fire-and-forget operations (manual reprocessing).
CREATE TABLE IF NOT EXISTS failed_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_failed_operations_created_at ON failed_operations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_failed_operations_operation_type ON failed_operations (operation_type);

COMMENT ON TABLE failed_operations IS 'DLQ: failed async operations for manual reprocessing.';
