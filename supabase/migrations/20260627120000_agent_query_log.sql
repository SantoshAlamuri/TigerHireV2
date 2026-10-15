-- Read-only hiring-data agent (v1) — per-turn audit log.
--
-- One row per question asked through the read-only data agent: the question,
-- the tool the model chose, its args, the row count returned, and latency.
-- Org-scoped via RLS so recruiters can only read/insert their own org's rows;
-- writes happen through the recruiter's user-JWT client (never service_role),
-- so the INSERT policy is what actually authorises each log write.
--
-- Mirrors the repo's org-scoped RLS pattern: public.auth_role() /
-- public.auth_organisation_ids() with DROP POLICY IF EXISTS for idempotency.

CREATE TABLE IF NOT EXISTS public.agent_query_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  question        text NOT NULL,
  tool            text NOT NULL,
  args            jsonb,
  row_count       integer,
  latency_ms      integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_query_log_org_created_at
  ON public.agent_query_log (organisation_id, created_at DESC);

ALTER TABLE public.agent_query_log ENABLE ROW LEVEL SECURITY;

-- Read: super_admin sees all; everyone else only their own org's rows.
DROP POLICY IF EXISTS "Org members read own agent query log" ON public.agent_query_log;
CREATE POLICY "Org members read own agent query log"
  ON public.agent_query_log FOR SELECT
  USING (
    public.auth_role() = 'super_admin'
    OR organisation_id = ANY (public.auth_organisation_ids())
  );

-- Insert: only into your own org, and only attributed to yourself.
DROP POLICY IF EXISTS "Org members insert own agent query log" ON public.agent_query_log;
CREATE POLICY "Org members insert own agent query log"
  ON public.agent_query_log FOR INSERT
  WITH CHECK (
    organisation_id = ANY (public.auth_organisation_ids())
    AND user_id = (SELECT auth.uid())
  );

-- No UPDATE/DELETE policies: the log is append-only for org members.

GRANT SELECT, INSERT ON public.agent_query_log TO authenticated;
