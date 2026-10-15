-- Signals: raw candidate signals from Talent Scout (e.g. Naukri scrape). Enriched and linked to candidates.
-- status: raw -> enriched (after Claude extract) -> verified (VerifyKit) or rejected.

CREATE TABLE signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source signal_source NOT NULL,
  external_id text NOT NULL,
  raw_data jsonb,
  signal_strength smallint CHECK (signal_strength >= 0 AND signal_strength <= 100),
  status signal_status NOT NULL DEFAULT 'raw',
  candidate_id uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signals_source_external_unique UNIQUE (source, external_id)
);

CREATE INDEX idx_signals_candidate_id ON signals (candidate_id);
CREATE INDEX idx_signals_status ON signals (status);
CREATE INDEX idx_signals_processed_at ON signals (processed_at) WHERE processed_at IS NOT NULL;
CREATE INDEX idx_signals_created_at ON signals (created_at DESC);

COMMENT ON TABLE signals IS 'Raw candidate signals from scrapers; status raw|enriched|verified|rejected. Linked to candidates after enrichment.';
