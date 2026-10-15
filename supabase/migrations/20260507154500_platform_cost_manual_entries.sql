-- Allow manual cost entries on platform_cost_events for providers we cannot
-- auto-sync today (e.g. Meta/WhatsApp when Graph billing is unavailable, job
-- boards, Twilio, ad-hoc one-off invoices). Adds a "manual" status and
-- traceability columns (entered_by, note) so the Super Admin UI can record and
-- display who added each line and why.

-- Status was previously implied by the column default ('estimated') with no
-- enforced check. Add a CHECK so callers cannot drift, and include 'manual'.
ALTER TABLE public.platform_cost_events
  DROP CONSTRAINT IF EXISTS platform_cost_events_status_check;

ALTER TABLE public.platform_cost_events
  ADD CONSTRAINT platform_cost_events_status_check
  CHECK (status IN ('estimated', 'invoiced', 'manual'));

ALTER TABLE public.platform_cost_events
  ADD COLUMN IF NOT EXISTS entered_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note text;

COMMENT ON COLUMN public.platform_cost_events.status IS
  'estimated = derived from token/usage counts; invoiced = pulled from provider billing API; manual = entered by Super Admin via UI.';
COMMENT ON COLUMN public.platform_cost_events.entered_by IS
  'Auth user that recorded a manual entry (NULL for auto-synced rows).';
COMMENT ON COLUMN public.platform_cost_events.note IS
  'Optional free-text note for manual entries (e.g. invoice reference).';

-- Recreate the daily rollup view to expose the same columns; SUM still works
-- across statuses but the admin UI can now break out manual spend explicitly.
CREATE OR REPLACE VIEW public.platform_cost_daily
WITH (security_invoker = true) AS
SELECT
  date_trunc('day', occurred_at) AS bucket_day,
  provider,
  service,
  status,
  currency,
  SUM(amount_usd) AS amount_usd,
  SUM(quantity) AS quantity,
  COUNT(*) AS events_count
FROM public.platform_cost_events
GROUP BY 1, 2, 3, 4, 5;

GRANT SELECT ON public.platform_cost_daily TO anon, authenticated;
