CREATE TABLE IF NOT EXISTS public.llm_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  request_id text,
  organisation_id uuid,
  model text NOT NULL,
  purpose text NOT NULL,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  status text NOT NULL,
  error_class text,
  cost_usd numeric(10, 6)
);

CREATE INDEX IF NOT EXISTS idx_llm_call_logs_created_org
  ON public.llm_call_logs (created_at DESC, organisation_id);

CREATE INDEX IF NOT EXISTS idx_llm_call_logs_purpose_status
  ON public.llm_call_logs (purpose, status);

ALTER TABLE public.llm_call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage llm_call_logs" ON public.llm_call_logs;
CREATE POLICY "Service role can manage llm_call_logs"
  ON public.llm_call_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
