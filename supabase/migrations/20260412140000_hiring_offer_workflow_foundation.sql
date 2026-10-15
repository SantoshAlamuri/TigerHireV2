-- Foundation for BRD/PRD hiring approval & offer management plan:
-- append-only hiring_offer_audit_events, extended hiring_requests + REQ codes,
-- workflow_instances / workflow_stages (finance SLA for offers),
-- stubs: compensation_bands, offer_document_versions.

BEGIN;

-- ─── 1. Urgency: allow API value "urgent" alongside legacy "critical" ───
ALTER TABLE public.hiring_requests
  DROP CONSTRAINT IF EXISTS hiring_requests_urgency_check;

ALTER TABLE public.hiring_requests
  ADD CONSTRAINT hiring_requests_urgency_check
  CHECK (urgency IN ('low', 'normal', 'high', 'critical', 'urgent'));

-- ─── 2. Hiring request status machine (BRD REQ-HR-003) ───
UPDATE public.hiring_requests SET status = 'submitted' WHERE status = 'pending';

ALTER TABLE public.hiring_requests
  DROP CONSTRAINT IF EXISTS hiring_requests_status_check;

ALTER TABLE public.hiring_requests
  ADD CONSTRAINT hiring_requests_status_check
  CHECK (status IN (
    'draft',
    'submitted',
    'under_review',
    'approved',
    'rejected',
    'on_hold',
    'converted'
  ));

ALTER TABLE public.hiring_requests
  ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE public.hiring_requests
  ADD COLUMN IF NOT EXISTS req_code text,
  ADD COLUMN IF NOT EXISTS role_level text,
  ADD COLUMN IF NOT EXISTS cost_center text,
  ADD COLUMN IF NOT EXISTS employment_type text
    CHECK (employment_type IS NULL OR employment_type IN ('full_time', 'contract', 'intern')),
  ADD COLUMN IF NOT EXISTS location_type text
    CHECK (location_type IS NULL OR location_type IN ('office', 'remote', 'hybrid')),
  ADD COLUMN IF NOT EXISTS location_city text,
  ADD COLUMN IF NOT EXISTS headcount_type text
    CHECK (headcount_type IS NULL OR headcount_type IN ('new_hire', 'backfill')),
  ADD COLUMN IF NOT EXISTS business_justification text,
  ADD COLUMN IF NOT EXISTS target_joining_date date,
  ADD COLUMN IF NOT EXISTS budget_ctc_min numeric,
  ADD COLUMN IF NOT EXISTS budget_ctc_max numeric,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

UPDATE public.hiring_requests
SET submitted_at = created_at
WHERE submitted_at IS NULL
  AND status IN ('submitted', 'under_review', 'approved', 'rejected', 'on_hold', 'converted');

CREATE UNIQUE INDEX IF NOT EXISTS idx_hiring_requests_org_req_code
  ON public.hiring_requests (organisation_id, req_code)
  WHERE req_code IS NOT NULL;

COMMENT ON COLUMN public.hiring_requests.req_code IS 'Human-readable REQ-DEPT-YYYY-SEQ; assigned on submit.';

-- ─── 3. REQ code sequence (org + dept slug + calendar year, UTC) ───
CREATE TABLE IF NOT EXISTS public.hiring_request_code_seq (
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  dept_key text NOT NULL,
  year integer NOT NULL,
  last_seq integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organisation_id, dept_key, year)
);

ALTER TABLE public.hiring_request_code_seq ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hiring req code seq service only"
  ON public.hiring_request_code_seq
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE OR REPLACE FUNCTION public.allocate_hiring_request_code(p_org_id uuid, p_department text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dept text;
  v_year integer := (EXTRACT(YEAR FROM (timezone('utc', now()))))::integer;
  v_next integer;
BEGIN
  v_dept := upper(regexp_replace(coalesce(nullif(trim(p_department), ''), 'GEN'), '[^a-zA-Z0-9]', '', 'g'));
  IF v_dept IS NULL OR v_dept = '' THEN
    v_dept := 'GEN';
  END IF;
  IF length(v_dept) > 8 THEN
    v_dept := substring(v_dept FROM 1 FOR 8);
  END IF;

  INSERT INTO public.hiring_request_code_seq (organisation_id, dept_key, year, last_seq)
  VALUES (p_org_id, v_dept, v_year, 1)
  ON CONFLICT (organisation_id, dept_key, year)
  DO UPDATE SET last_seq = public.hiring_request_code_seq.last_seq + 1
  RETURNING last_seq INTO v_next;

  RETURN format('REQ-%s-%s-%s', v_dept, v_year, lpad(v_next::text, 3, '0'));
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_hiring_request_code(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_hiring_request_code(uuid, text) TO service_role;

-- ─── 4. Append-only audit spine (PRD F-04) ───
CREATE TABLE IF NOT EXISTS public.hiring_offer_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('hiring_request', 'offer', 'workflow_stage')),
  entity_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_role text,
  prev_status text,
  new_status text,
  decision text,
  comments text,
  document_version text,
  ip_address text,
  channel text NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'email_link', 'mobile', 'system', 'api')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hiring_offer_audit_org_created
  ON public.hiring_offer_audit_events (organisation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hiring_offer_audit_entity
  ON public.hiring_offer_audit_events (entity_type, entity_id, created_at DESC);

COMMENT ON TABLE public.hiring_offer_audit_events IS 'Append-only decisions for hiring requests and offers; written via service role only.';

ALTER TABLE public.hiring_offer_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hiring offer audit org read"
  ON public.hiring_offer_audit_events
  FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'finance', 'super_admin')
  );

CREATE POLICY "hiring offer audit service insert"
  ON public.hiring_offer_audit_events
  FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ─── 5. Workflow engine MVP tables ───
CREATE TABLE IF NOT EXISTS public.workflow_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('hiring_request', 'offer')),
  subject_id uuid NOT NULL,
  definition_key text NOT NULL DEFAULT 'default',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'paused')),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_instance_active_subject
  ON public.workflow_instances (subject_type, subject_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_workflow_instances_org ON public.workflow_instances (organisation_id, status);

ALTER TABLE public.workflow_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow instances org read"
  ON public.workflow_instances
  FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'hiring_manager', 'finance', 'super_admin')
  );

CREATE TABLE IF NOT EXISTS public.workflow_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.workflow_instances (id) ON DELETE CASCADE,
  stage_key text NOT NULL,
  stage_order integer NOT NULL,
  approver_role text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'approved', 'rejected', 'skipped', 'escalated', 'breached')),
  sla_due_at timestamptz,
  reminder_half_sent_at timestamptz,
  reminder_ninety_sent_at timestamptz,
  breach_recorded_at timestamptz,
  decided_at timestamptz,
  decided_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  decision text,
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_stages_instance
  ON public.workflow_stages (instance_id, stage_order);

ALTER TABLE public.workflow_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow stages org read"
  ON public.workflow_stages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workflow_instances wi
      WHERE wi.id = workflow_stages.instance_id
        AND wi.organisation_id = public.auth_organisation_id()
        AND public.auth_role() IN ('company_admin', 'recruiter', 'hiring_manager', 'finance', 'super_admin')
    )
  );

-- ─── 6. Offer: negotiating status + unique open offers ───
ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_status_check;

ALTER TABLE public.offers
  ADD CONSTRAINT offers_status_check
  CHECK (status IN (
    'draft',
    'pending_finance',
    'approved',
    'rejected',
    'sent',
    'accepted',
    'declined',
    'expired',
    'negotiating'
  ));

DROP INDEX IF EXISTS idx_offers_application_active;

CREATE UNIQUE INDEX idx_offers_application_active
  ON public.offers (application_id)
  WHERE status IN ('draft', 'pending_finance', 'approved', 'sent', 'negotiating');

-- ─── 7. Auto workflow for new offers (finance stage + 8h SLA, PRD stage 2a) ───
CREATE OR REPLACE FUNCTION public.trg_create_offer_finance_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wid uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending_finance' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.workflow_instances (
    organisation_id, subject_type, subject_id, definition_key, status, meta
  ) VALUES (
    NEW.organisation_id, 'offer', NEW.id, 'offer_finance_v1', 'active',
    jsonb_build_object('sla_hours', 8)
  )
  RETURNING id INTO wid;

  INSERT INTO public.workflow_stages (
    instance_id, stage_key, stage_order, approver_role, status, sla_due_at
  ) VALUES (
    wid, 'finance', 1, 'finance', 'active', NEW.created_at + interval '8 hours'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offers_create_workflow ON public.offers;
CREATE TRIGGER trg_offers_create_workflow
  AFTER INSERT ON public.offers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_create_offer_finance_workflow();

-- ─── 8. Phase 3 stubs (bands + offer document versions) ───
CREATE TABLE IF NOT EXISTS public.compensation_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  role_level text NOT NULL,
  department text,
  location_key text,
  min_ctc numeric NOT NULL,
  max_ctc numeric NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compensation_bands_org
  ON public.compensation_bands (organisation_id, role_level);

ALTER TABLE public.compensation_bands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compensation bands org read"
  ON public.compensation_bands
  FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'finance', 'super_admin')
  );

CREATE POLICY "compensation bands org admin write"
  ON public.compensation_bands
  FOR ALL
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'super_admin')
  )
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'super_admin')
  );

CREATE TABLE IF NOT EXISTS public.offer_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers (id) ON DELETE CASCADE,
  version_label text NOT NULL,
  storage_path text,
  content_hash text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  UNIQUE (offer_id, version_label)
);

CREATE INDEX IF NOT EXISTS idx_offer_document_versions_offer
  ON public.offer_document_versions (offer_id, generated_at DESC);

ALTER TABLE public.offer_document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "offer doc versions org read"
  ON public.offer_document_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.offers o
      WHERE o.id = offer_document_versions.offer_id
        AND o.organisation_id = public.auth_organisation_id()
        AND public.auth_role() IN ('company_admin', 'recruiter', 'hiring_manager', 'finance', 'super_admin')
    )
  );

-- ─── 9. HM hiring_requests UPDATE policy (draft / submitted editable) ───
DROP POLICY IF EXISTS "HM can update own pending requests" ON public.hiring_requests;

CREATE POLICY "HM can update own draft or submitted requests"
  ON public.hiring_requests
  FOR UPDATE
  USING (
    created_by = auth.uid()
    AND status IN ('draft', 'submitted')
  )
  WITH CHECK (created_by = auth.uid());

COMMIT;
