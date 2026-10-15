-- Performance: index for org-scoped, time-ordered reads of llm_call_logs.
-- Columns verified against supabase/migrations/20260420145500_llm_call_logs.sql:
--   organisation_id uuid, created_at timestamptz.
-- An existing index covers (created_at DESC, organisation_id) — good for global,
-- time-first scans. This composite leads with organisation_id so per-org dashboards
-- (WHERE organisation_id = $1 ORDER BY created_at DESC) can use an index range
-- scan instead of filtering a created_at-led index.
CREATE INDEX IF NOT EXISTS idx_llm_call_logs_org_created
  ON public.llm_call_logs (organisation_id, created_at DESC);
