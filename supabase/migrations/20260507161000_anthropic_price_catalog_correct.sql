-- Replace the original Anthropic seed in platform_price_catalog with rates
-- aligned to the published Anthropic pricing page (USD per 1k tokens). The
-- original migration set Opus to $0.005 / $0.025 (Claude 3 Opus) which is now
-- 3x lower than the actual Opus 4 rate. This migration also adds explicit
-- per-model rows for Sonnet 4 / Sonnet 4.5 / Haiku 4.5 / Haiku 3.5 / Opus 4
-- and the cache-aware metric keys (cache write = input × 1.25, cache read =
-- input × 0.10).
--
-- The `ledger.ts` cost calculator is the runtime source of truth; this seed
-- mirrors it so a Super Admin can audit the rates from the DB without
-- redeploying the app.

-- Drop the old rows so we don't keep stale Opus pricing.
DELETE FROM public.platform_price_catalog
WHERE provider = 'anthropic'
  AND service = 'messages'
  AND metric_key IN (
    'claude-sonnet-input-1k', 'claude-sonnet-output-1k',
    'claude-opus-input-1k', 'claude-opus-output-1k',
    'claude-haiku-input-1k', 'claude-haiku-output-1k'
  );

INSERT INTO public.platform_price_catalog
  (provider, service, metric_key, unit, price_usd, metadata)
VALUES
  -- Sonnet 4 / 4.5
  ('anthropic', 'messages', 'claude-sonnet-4-input-1k', 'tokens', 0.003,
   '{"model_family":"sonnet","version":"4","direction":"input"}'::jsonb),
  ('anthropic', 'messages', 'claude-sonnet-4-output-1k', 'tokens', 0.015,
   '{"model_family":"sonnet","version":"4","direction":"output"}'::jsonb),
  ('anthropic', 'messages', 'claude-sonnet-4-cache-write-1k', 'tokens', 0.00375,
   '{"model_family":"sonnet","version":"4","direction":"cache_creation"}'::jsonb),
  ('anthropic', 'messages', 'claude-sonnet-4-cache-read-1k', 'tokens', 0.0003,
   '{"model_family":"sonnet","version":"4","direction":"cache_read"}'::jsonb),

  -- Haiku 4.5
  ('anthropic', 'messages', 'claude-haiku-4-5-input-1k', 'tokens', 0.001,
   '{"model_family":"haiku","version":"4.5","direction":"input"}'::jsonb),
  ('anthropic', 'messages', 'claude-haiku-4-5-output-1k', 'tokens', 0.005,
   '{"model_family":"haiku","version":"4.5","direction":"output"}'::jsonb),
  ('anthropic', 'messages', 'claude-haiku-4-5-cache-write-1k', 'tokens', 0.00125,
   '{"model_family":"haiku","version":"4.5","direction":"cache_creation"}'::jsonb),
  ('anthropic', 'messages', 'claude-haiku-4-5-cache-read-1k', 'tokens', 0.0001,
   '{"model_family":"haiku","version":"4.5","direction":"cache_read"}'::jsonb),

  -- Haiku 3.5 (legacy)
  ('anthropic', 'messages', 'claude-3-5-haiku-input-1k', 'tokens', 0.0008,
   '{"model_family":"haiku","version":"3.5","direction":"input"}'::jsonb),
  ('anthropic', 'messages', 'claude-3-5-haiku-output-1k', 'tokens', 0.004,
   '{"model_family":"haiku","version":"3.5","direction":"output"}'::jsonb),

  -- Opus 4 / 4.1 — corrected from the original $0.005 / $0.025 (that was Claude 3 Opus)
  ('anthropic', 'messages', 'claude-opus-4-input-1k', 'tokens', 0.015,
   '{"model_family":"opus","version":"4","direction":"input"}'::jsonb),
  ('anthropic', 'messages', 'claude-opus-4-output-1k', 'tokens', 0.075,
   '{"model_family":"opus","version":"4","direction":"output"}'::jsonb),
  ('anthropic', 'messages', 'claude-opus-4-cache-write-1k', 'tokens', 0.01875,
   '{"model_family":"opus","version":"4","direction":"cache_creation"}'::jsonb),
  ('anthropic', 'messages', 'claude-opus-4-cache-read-1k', 'tokens', 0.0015,
   '{"model_family":"opus","version":"4","direction":"cache_read"}'::jsonb)
ON CONFLICT (provider, service, metric_key, effective_from) DO NOTHING;
