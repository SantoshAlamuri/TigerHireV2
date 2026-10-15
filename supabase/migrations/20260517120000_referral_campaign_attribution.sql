BEGIN;

-- Durable referral campaign attribution on applications (Brief 9 Scope 1).
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS referral_campaign_id uuid REFERENCES public.referral_campaigns (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_applications_referral_campaign_id
  ON public.applications (referral_campaign_id)
  WHERE referral_campaign_id IS NOT NULL;

COMMENT ON COLUMN public.applications.referral_campaign_id IS
  'Set when apply/referral path matches an active campaign recipient; forward-only attribution.';

-- Allow auto_ended lifecycle events from hourly cron.
ALTER TABLE public.referral_campaign_events
  DROP CONSTRAINT IF EXISTS referral_campaign_events_event_type_check;

ALTER TABLE public.referral_campaign_events
  ADD CONSTRAINT referral_campaign_events_event_type_check
  CHECK (
    event_type IN (
      'launch_started',
      'launch_completed',
      'launch_scheduled',
      'send_attempted',
      'send_succeeded',
      'send_failed',
      'paused',
      'resumed',
      'ended',
      'auto_ended',
      'application_attributed',
      'shortlisted_attributed',
      'offer_attributed',
      'hire_attributed'
    )
  );

COMMIT;
