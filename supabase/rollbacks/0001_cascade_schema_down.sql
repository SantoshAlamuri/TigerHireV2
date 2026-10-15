-- Rollback for 20260604120000_0001_cascade_schema.sql — APPLY MANUALLY ONLY (via MCP / psql).
-- Lives in supabase/rollbacks/ (NOT supabase/migrations/) so `supabase db push` never
-- auto-runs it: it is destructive (drops cascade tables/columns + deletes feature flags).

DELETE FROM public.feature_flags
WHERE key IN (
  'ff_path_unification',
  'ff_haiku_extraction',
  'ff_structured_jd',
  'ff_whatsapp_gate',
  'ff_cascade_rerank',
  'ff_ctc_tiering'
);

DROP TABLE IF EXISTS public.prescreen_responses;
DROP TABLE IF EXISTS public.prescreen_questions;
DROP TABLE IF EXISTS public.jd_requirements;
DROP TABLE IF EXISTS public.rerank_cache;

ALTER TABLE public.fit_scores
  DROP COLUMN IF EXISTS scoring_tier,
  DROP COLUMN IF EXISTS model_used;
