BEGIN;

-- Referral campaign management MVP: org-scoped campaign setup, launch recipient snapshot,
-- outbound send tracking, and attribution/event logging.

CREATE TABLE IF NOT EXISTS public.referral_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  name text NOT NULL,
  objective text NOT NULL DEFAULT 'more_referrals'
    CHECK (objective IN ('more_referrals', 'urgent_role_fill')),
  audience_filter text NOT NULL DEFAULT 'all_referrers'
    CHECK (audience_filter IN ('all_referrers', 'org_verified_only', 'city_match')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  starts_at timestamptz,
  ends_at timestamptz,
  launched_at timestamptz,
  ended_at timestamptz,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_referral_campaigns_org_status_updated
  ON public.referral_campaigns (organisation_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.referral_campaign_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.referral_campaigns (id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_campaign_jobs_org_campaign
  ON public.referral_campaign_jobs (organisation_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_referral_campaign_jobs_job
  ON public.referral_campaign_jobs (job_id);

CREATE TABLE IF NOT EXISTS public.referral_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.referral_campaigns (id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES public.referrers (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'sent', 'failed', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, referrer_id)
);

CREATE INDEX IF NOT EXISTS idx_ref_campaign_recipients_campaign_status
  ON public.referral_campaign_recipients (campaign_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ref_campaign_recipients_referrer
  ON public.referral_campaign_recipients (referrer_id);

CREATE TABLE IF NOT EXISTS public.referral_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.referral_campaigns (id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.referral_campaign_recipients (id) ON DELETE SET NULL,
  referrer_id uuid REFERENCES public.referrers (id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs (id) ON DELETE SET NULL,
  event_type text NOT NULL
    CHECK (
      event_type IN (
        'launch_started',
        'launch_completed',
        'send_attempted',
        'send_succeeded',
        'send_failed',
        'paused',
        'resumed',
        'ended',
        'application_attributed',
        'shortlisted_attributed',
        'offer_attributed',
        'hire_attributed'
      )
    ),
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ref_campaign_events_campaign_created
  ON public.referral_campaign_events (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ref_campaign_events_event_type
  ON public.referral_campaign_events (event_type, created_at DESC);

ALTER TABLE public.referral_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_campaign_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_campaign_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral campaigns org read"
  ON public.referral_campaigns
  FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('leadership', 'recruiter', 'hiring_manager', 'super_admin')
  );

CREATE POLICY "referral campaigns org write"
  ON public.referral_campaigns
  FOR ALL
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('leadership', 'recruiter', 'super_admin')
  )
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('leadership', 'recruiter', 'super_admin')
  );

CREATE POLICY "referral campaign jobs org read"
  ON public.referral_campaign_jobs
  FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('leadership', 'recruiter', 'hiring_manager', 'super_admin')
  );

CREATE POLICY "referral campaign jobs org write"
  ON public.referral_campaign_jobs
  FOR ALL
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('leadership', 'recruiter', 'super_admin')
  )
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('leadership', 'recruiter', 'super_admin')
  );

CREATE POLICY "referral campaign recipients org read"
  ON public.referral_campaign_recipients
  FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('leadership', 'recruiter', 'hiring_manager', 'super_admin')
  );

CREATE POLICY "referral campaign recipients org write"
  ON public.referral_campaign_recipients
  FOR ALL
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('leadership', 'recruiter', 'super_admin')
  )
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('leadership', 'recruiter', 'super_admin')
  );

CREATE POLICY "referral campaign events org read"
  ON public.referral_campaign_events
  FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('leadership', 'recruiter', 'hiring_manager', 'super_admin')
  );

CREATE POLICY "referral campaign events org write"
  ON public.referral_campaign_events
  FOR ALL
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('leadership', 'recruiter', 'super_admin')
  )
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('leadership', 'recruiter', 'super_admin')
  );

COMMENT ON TABLE public.referral_campaigns IS 'Organisation-scoped referral campaign metadata and lifecycle.';
COMMENT ON TABLE public.referral_campaign_jobs IS 'Jobs targeted by each referral campaign.';
COMMENT ON TABLE public.referral_campaign_recipients IS 'Materialized recipient snapshot and send status per campaign.';
COMMENT ON TABLE public.referral_campaign_events IS 'Append-only log for campaign launch, send outcomes, and conversion attribution.';

COMMIT;
