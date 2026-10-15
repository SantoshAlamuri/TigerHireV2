BEGIN;

ALTER TABLE public.screening_jobs
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz DEFAULT now();

UPDATE public.screening_jobs
SET last_activity_at = COALESCE(last_activity_at, updated_at, created_at, now())
WHERE last_activity_at IS NULL;

CREATE OR REPLACE FUNCTION public.complete_voice_screening_job(
  p_job_id uuid,
  p_organisation_id uuid,
  p_bolna_call_id text,
  p_duration_seconds integer,
  p_cost_inr numeric,
  p_audio_url text,
  p_transcript_url text,
  p_summary_json jsonb,
  p_recommendation text,
  p_completed_at timestamptz
)
RETURNS TABLE (
  id uuid,
  charge_inr numeric,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_free_credits integer := 10;
  v_completed_calls integer := 0;
  v_charge_inr numeric := 0;
  v_month_start_utc timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('voice_billing_' || p_organisation_id::text));

  SELECT COALESCE(o.voice_screening_free_credits_per_month, 10)
  INTO v_free_credits
  FROM public.organisations o
  WHERE o.id = p_organisation_id;

  v_month_start_utc := date_trunc('month', p_completed_at AT TIME ZONE 'Asia/Kolkata')
    AT TIME ZONE 'Asia/Kolkata';

  SELECT COUNT(*)
  INTO v_completed_calls
  FROM public.screening_jobs sj
  WHERE sj.organisation_id = p_organisation_id
    AND sj.mode = 'voice'
    AND sj.status = 'completed'
    AND sj.billable = true
    AND sj.ended_at >= v_month_start_utc
    AND sj.id <> p_job_id;

  v_charge_inr := CASE
    WHEN v_completed_calls < GREATEST(v_free_credits, 0) THEN 0
    ELSE 99
  END;

  RETURN QUERY
  UPDATE public.screening_jobs sj
  SET
    status = 'completed',
    bolna_call_id = COALESCE(p_bolna_call_id, sj.bolna_call_id),
    duration_seconds = p_duration_seconds,
    billable = true,
    cost_inr = p_cost_inr,
    charge_inr = v_charge_inr,
    summary_json = p_summary_json,
    recommendation = p_recommendation,
    ended_at = p_completed_at,
    audio_url = COALESCE(p_audio_url, sj.audio_url),
    transcript_url = COALESCE(p_transcript_url, sj.transcript_url),
    last_activity_at = p_completed_at,
    updated_at = now()
  WHERE sj.id = p_job_id
    AND sj.organisation_id = p_organisation_id
    AND sj.mode = 'voice'
    AND sj.status IN ('awaiting_consent', 'in_progress')
  RETURNING sj.id, sj.charge_inr, sj.status;
END;
$$;

CREATE OR REPLACE VIEW public.monthly_billing_audit AS
SELECT
  sj.organisation_id,
  date_trunc('month', sj.ended_at AT TIME ZONE 'Asia/Kolkata') AS billing_month_ist,
  COUNT(*) AS completed_calls,
  COUNT(*) FILTER (WHERE sj.charge_inr = 0) AS free_calls,
  COUNT(*) FILTER (WHERE sj.charge_inr = 99) AS paid_calls,
  COALESCE(SUM(sj.charge_inr), 0) AS total_charge_inr,
  CASE
    WHEN COUNT(*) FILTER (WHERE sj.charge_inr = 0) > 10 THEN 'ANOMALY: more than 10 free calls in month'
    WHEN COUNT(*) FILTER (WHERE sj.charge_inr = 99) > 0
      AND COUNT(*) FILTER (WHERE sj.charge_inr = 0) < 10 THEN 'ANOMALY: paid calls before 10 free used'
    ELSE 'ok'
  END AS audit_status
FROM public.screening_jobs sj
WHERE sj.mode = 'voice'
  AND sj.status = 'completed'
  AND sj.billable = true
GROUP BY sj.organisation_id, date_trunc('month', sj.ended_at AT TIME ZONE 'Asia/Kolkata');

COMMIT;
