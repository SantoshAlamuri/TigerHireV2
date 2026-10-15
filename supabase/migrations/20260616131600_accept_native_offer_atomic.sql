-- Atomic native offer acceptance.
--
-- Previously syncPipelineOnNativeOfferAccepted() performed three independent writes
-- in sequence (pipeline_candidates move, applications update, placement-fee billing
-- insert). A partial failure could leave an accepted offer with no placement-fee
-- billing row — i.e. revenue silently lost. This wraps all three writes in a single
-- transactional function so they commit together or not at all.
--
-- SECURITY DEFINER so it runs with the table owner's rights (called from the service
-- role via rpc), matching how the application already mutates these tables.

CREATE OR REPLACE FUNCTION public.accept_native_offer(
  p_application_id uuid,
  p_organisation_id uuid,
  p_job_id uuid,
  p_candidate_id uuid,
  p_offer_id uuid,
  p_stage_id uuid,
  p_ctc_value numeric,
  p_billing_ctc_required boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  -- 1) Move the candidate into the resolved "offer accepted" stage (when both exist).
  IF p_stage_id IS NOT NULL THEN
    UPDATE public.pipeline_candidates
       SET stage_id = p_stage_id
     WHERE job_id = p_job_id
       AND candidate_id = p_candidate_id;
  END IF;

  -- 2) Stamp the application as offer-accepted.
  UPDATE public.applications
     SET stage_type = 'offer',
         offer_accepted_at = v_now,
         billing_ctc_required = p_billing_ctc_required,
         status = 'in_progress',
         updated_at = v_now
   WHERE id = p_application_id;

  -- 3) Record the pending placement-fee billing event. The partial unique index
  --    (one pending per application) makes this idempotent across retries.
  INSERT INTO public.placement_fee_billing_events (
    organisation_id,
    job_id,
    candidate_id,
    application_id,
    offer_id,
    offer_accepted_at,
    ctc_value,
    billing_status
  )
  VALUES (
    p_organisation_id,
    p_job_id,
    p_candidate_id,
    p_application_id,
    p_offer_id,
    v_now,
    p_ctc_value,
    'pending'
  )
  ON CONFLICT (application_id) WHERE billing_status = 'pending' DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.accept_native_offer IS
  'Atomically moves pipeline stage, stamps application offer-accepted, and records the placement-fee billing row in one transaction.';
