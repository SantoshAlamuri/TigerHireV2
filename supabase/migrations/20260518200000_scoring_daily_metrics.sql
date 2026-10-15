-- Daily FitScore cost / efficiency rollups (cron + manual script).

CREATE TABLE IF NOT EXISTS public.scoring_daily_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL UNIQUE,
  candidates_scored int,
  total_claude_calls int,
  calls_per_score numeric(4, 1),
  dedupe_skips int,
  concurrent_skips int,
  retry_count int,
  vision_fallback_triggered int,
  vision_fallback_skipped int,
  cache_hit_rate_pct numeric(5, 1),
  total_cost_usd numeric(8, 4),
  cost_per_score_usd numeric(6, 4),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scoring_daily_metrics_date
  ON public.scoring_daily_metrics (date DESC);

COMMENT ON TABLE public.scoring_daily_metrics IS
  'Daily FitScore Claude cost and guardrail metrics (from platform_cost_events + fit_scores).';

ALTER TABLE public.scoring_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY scoring_daily_metrics_super_admin_select
  ON public.scoring_daily_metrics FOR SELECT
  USING ((SELECT public.auth_role()) = 'super_admin'::public.app_role);
