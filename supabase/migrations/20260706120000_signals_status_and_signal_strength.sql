-- Fix schema drift: code has always written signals.status ('raw' | 'enriched')
-- and signals.signal_strength (0-100), but no migration ever added the columns —
-- POST /api/signals/ingest failed and the talent-scout cron errored every run
-- ("column signals.status does not exist") on both prod Mumbai and preview Sydney.

ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'raw',
  ADD COLUMN IF NOT EXISTS signal_strength numeric;

COMMENT ON COLUMN public.signals.status IS
  'Signal lifecycle: raw (ingested, awaiting enrichment) or enriched (talent-scout processed).';
COMMENT ON COLUMN public.signals.signal_strength IS
  'Intent score 0-100 from enrichment (SignalHunt contract).';

-- Rows processed before this column existed should not be re-enriched.
UPDATE public.signals
SET status = 'enriched'
WHERE processed_at IS NOT NULL
  AND status = 'raw';

-- The talent-scout cron polls: WHERE status = 'raw' ORDER BY created_at ASC.
CREATE INDEX IF NOT EXISTS idx_signals_status_raw
  ON public.signals (created_at)
  WHERE status = 'raw';
