BEGIN;

-- Align referral campaign RLS with Brief 1 role rename (company_admin → leadership).
-- Safe to re-run: drops policies by name then recreates with production app_role values.

DROP POLICY IF EXISTS "referral campaigns org read" ON public.referral_campaigns;
DROP POLICY IF EXISTS "referral campaigns org write" ON public.referral_campaigns;
DROP POLICY IF EXISTS "referral campaign jobs org read" ON public.referral_campaign_jobs;
DROP POLICY IF EXISTS "referral campaign jobs org write" ON public.referral_campaign_jobs;
DROP POLICY IF EXISTS "referral campaign recipients org read" ON public.referral_campaign_recipients;
DROP POLICY IF EXISTS "referral campaign recipients org write" ON public.referral_campaign_recipients;
DROP POLICY IF EXISTS "referral campaign events org read" ON public.referral_campaign_events;
DROP POLICY IF EXISTS "referral campaign events org write" ON public.referral_campaign_events;

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

COMMIT;
