-- Supabase security advisor: views should use SECURITY INVOKER so RLS of the querying role applies.
-- Postgres 15+ (project uses PG 17).
CREATE OR REPLACE VIEW public.platform_cost_daily
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
FROM public.platform_cost_events
GROUP BY 1, 2, 3, 4, 5;
