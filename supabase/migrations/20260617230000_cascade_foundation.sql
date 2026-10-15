-- Phase 1: Cascade Foundation — verdict cache + decision log + budget tracking.
--
-- Three tables wired so every cascade decision is auditable and the cost gate
-- has the data it needs without scanning llm_call_logs on every API request.
--
-- 1. verdict_cache    — hash(candidate_norm, jd_norm) → cached verdict
-- 2. cascade_decisions — every cascade run, which layer resolved it, cost in
--                        INR paise, latency. Powers /api/admin/cascade/report.
-- 3. budget_state      — daily/monthly anthropic spend in INR (paise).
--                        Updated by trigger or aggregate query; surfaced by
--                        the budget gate before every Anthropic call.

BEGIN;

CREATE TABLE IF NOT EXISTS public.verdict_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_hash text NOT NULL,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  organisation_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  layer_resolved text NOT NULL CHECK (layer_resolved IN (
    'LAYER_0_KNOCKOUT','LAYER_0_QUALIFY','LAYER_1','LAYER_2','LAYER_3'
  )),
  verdict_json jsonb NOT NULL,
  cost_inr_paise integer NOT NULL DEFAULT 0,
  invalidated_at timestamptz,
  invalidated_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_verdict_cache_hash_active
  ON public.verdict_cache (entity_hash)
  WHERE invalidated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_verdict_cache_org_created
  ON public.verdict_cache (organisation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_verdict_cache_expires_unused
  ON public.verdict_cache (expires_at)
  WHERE invalidated_at IS NULL;

COMMENT ON TABLE public.verdict_cache IS
  'Cascade verdict cache. entity_hash dedupes (candidate, jd) pairs across re-scores.';

ALTER TABLE public.verdict_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY verdict_cache_service_role_all
  ON public.verdict_cache
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.cascade_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_hash text NOT NULL,
  candidate_id uuid,
  job_id uuid,
  organisation_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  layer_resolved text NOT NULL CHECK (layer_resolved IN (
    'LAYER_0_KNOCKOUT','LAYER_0_QUALIFY','LAYER_1','LAYER_2','LAYER_3','CACHE_HIT'
  )),
  knockout_reason text,
  cost_inr_paise integer NOT NULL DEFAULT 0,
  cost_usd_micros integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  cache_hit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cascade_decisions_created
  ON public.cascade_decisions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cascade_decisions_org_created
  ON public.cascade_decisions (organisation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cascade_decisions_layer_created
  ON public.cascade_decisions (layer_resolved, created_at DESC);

COMMENT ON TABLE public.cascade_decisions IS
  'Append-only log of every cascade run. Powers the cost + layer-distribution report at /api/admin/cascade/report.';

ALTER TABLE public.cascade_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY cascade_decisions_service_role_all
  ON public.cascade_decisions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.budget_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  window_kind text NOT NULL CHECK (window_kind IN ('day','month')),
  window_start_utc date NOT NULL,
  spend_inr_paise bigint NOT NULL DEFAULT 0,
  spend_usd_micros bigint NOT NULL DEFAULT 0,
  call_count integer NOT NULL DEFAULT 0,
  warn_alert_sent_at timestamptz,
  block_alert_sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_state_window_unique
  ON public.budget_state (window_kind, window_start_utc);

COMMENT ON TABLE public.budget_state IS
  'Daily + monthly Anthropic spend rollup. Read by anthropic-budget-gate before every callClaude; updated atomically after each call.';

ALTER TABLE public.budget_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY budget_state_service_role_all
  ON public.budget_state
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Atomic spend recorder. Called after every successful callClaude.
-- Updates both day + month windows in one round-trip.
CREATE OR REPLACE FUNCTION public.record_anthropic_spend(
  p_cost_inr_paise integer,
  p_cost_usd_micros integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := (now() at time zone 'UTC')::date;
  v_month_start date := date_trunc('month', (now() at time zone 'UTC'))::date;
BEGIN
  INSERT INTO public.budget_state (window_kind, window_start_utc, spend_inr_paise, spend_usd_micros, call_count, updated_at)
  VALUES ('day', v_today, p_cost_inr_paise, p_cost_usd_micros, 1, now())
  ON CONFLICT (window_kind, window_start_utc) DO UPDATE
    SET spend_inr_paise = budget_state.spend_inr_paise + EXCLUDED.spend_inr_paise,
        spend_usd_micros = budget_state.spend_usd_micros + EXCLUDED.spend_usd_micros,
        call_count = budget_state.call_count + 1,
        updated_at = now();

  INSERT INTO public.budget_state (window_kind, window_start_utc, spend_inr_paise, spend_usd_micros, call_count, updated_at)
  VALUES ('month', v_month_start, p_cost_inr_paise, p_cost_usd_micros, 1, now())
  ON CONFLICT (window_kind, window_start_utc) DO UPDATE
    SET spend_inr_paise = budget_state.spend_inr_paise + EXCLUDED.spend_inr_paise,
        spend_usd_micros = budget_state.spend_usd_micros + EXCLUDED.spend_usd_micros,
        call_count = budget_state.call_count + 1,
        updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_anthropic_spend(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_anthropic_spend(integer, integer) TO service_role;

COMMIT;
