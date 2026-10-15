-- Per-role Anthropic budget cap.
--
-- The unit of revenue is a role (₹5,000 flat / 1,000 profiles), so the unit of
-- cost-control must also be the role — not a global day/month window. A viral
-- job drawing 10k applies, or a bot hammering one job, is now contained to that
-- one role's budget instead of eating the whole platform's daily allowance.
--
-- The global budget_state (day/month) from 20260617230000 stays as a SECONDARY
-- backstop — it catches a cross-role systemic runaway (e.g. 1,000 fake roles each
-- staying just under the per-role cap). Per-role is the primary gate.

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_budget_state (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  spend_inr_paise bigint NOT NULL DEFAULT 0,
  spend_usd_micros bigint NOT NULL DEFAULT 0,
  call_count integer NOT NULL DEFAULT 0,
  -- Per-role cap in paise. NULL means "use the env default" (resolved in app).
  cap_inr_paise bigint,
  warn_alert_sent_at timestamptz,
  blocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_budget_state_org
  ON public.job_budget_state (organisation_id, spend_inr_paise DESC);

CREATE INDEX IF NOT EXISTS idx_job_budget_state_blocked
  ON public.job_budget_state (blocked_at)
  WHERE blocked_at IS NOT NULL;

COMMENT ON TABLE public.job_budget_state IS
  'Per-role (per-job) Anthropic spend in INR paise. Primary cost gate — read before every callClaude that carries a jobId; updated atomically after each call. cap_inr_paise NULL => app uses ANTHROPIC_ROLE_CAP_INR env default.';

ALTER TABLE public.job_budget_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_budget_state_service_role_all ON public.job_budget_state;
CREATE POLICY job_budget_state_service_role_all
  ON public.job_budget_state
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Atomic per-role spend recorder. Upserts the job row and returns the running
-- total so the caller can decide whether the cap was just crossed.
CREATE OR REPLACE FUNCTION public.record_job_anthropic_spend(
  p_job_id uuid,
  p_organisation_id uuid,
  p_cost_inr_paise integer,
  p_cost_usd_micros integer
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_total bigint;
BEGIN
  IF p_job_id IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.job_budget_state (
    job_id, organisation_id, spend_inr_paise, spend_usd_micros, call_count, updated_at
  )
  VALUES (p_job_id, p_organisation_id, p_cost_inr_paise, p_cost_usd_micros, 1, now())
  ON CONFLICT (job_id) DO UPDATE
    SET spend_inr_paise = job_budget_state.spend_inr_paise + EXCLUDED.spend_inr_paise,
        spend_usd_micros = job_budget_state.spend_usd_micros + EXCLUDED.spend_usd_micros,
        call_count = job_budget_state.call_count + 1,
        updated_at = now()
  RETURNING spend_inr_paise INTO v_new_total;

  RETURN v_new_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_job_anthropic_spend(uuid, uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_job_anthropic_spend(uuid, uuid, integer, integer)
  TO service_role;

COMMIT;
