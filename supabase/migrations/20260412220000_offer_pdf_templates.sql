-- B2: Org-scoped offer PDF templates (versioned bodies) + document version metadata.

BEGIN;

CREATE TABLE IF NOT EXISTS public.offer_pdf_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default offer letter',
  is_default boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_pdf_templates_org
  ON public.offer_pdf_templates (organisation_id)
  WHERE is_archived = false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_pdf_templates_one_default_per_org
  ON public.offer_pdf_templates (organisation_id)
  WHERE is_default = true AND is_archived = false;

COMMENT ON TABLE public.offer_pdf_templates IS 'B2: reusable offer letter templates per organisation.';

CREATE TABLE IF NOT EXISTS public.offer_pdf_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.offer_pdf_templates (id) ON DELETE CASCADE,
  version_number int NOT NULL,
  body_text text NOT NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_offer_pdf_template_versions_template
  ON public.offer_pdf_template_versions (template_id, version_number DESC);

COMMENT ON TABLE public.offer_pdf_template_versions IS 'B2: append-only template body revisions.';

DROP TRIGGER IF EXISTS offer_pdf_templates_updated_at ON public.offer_pdf_templates;
CREATE TRIGGER offer_pdf_templates_updated_at
  BEFORE UPDATE ON public.offer_pdf_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.offer_pdf_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offer pdf templates org read" ON public.offer_pdf_templates;
CREATE POLICY "offer pdf templates org read"
  ON public.offer_pdf_templates FOR SELECT
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN (
      'company_admin', 'recruiter', 'hiring_manager', 'finance', 'super_admin'
    )
  );

DROP POLICY IF EXISTS "offer pdf templates org write" ON public.offer_pdf_templates;
CREATE POLICY "offer pdf templates org write"
  ON public.offer_pdf_templates FOR INSERT
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'hiring_manager', 'super_admin')
  );

DROP POLICY IF EXISTS "offer pdf templates org update" ON public.offer_pdf_templates;
CREATE POLICY "offer pdf templates org update"
  ON public.offer_pdf_templates FOR UPDATE
  USING (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'hiring_manager', 'super_admin')
  )
  WITH CHECK (
    organisation_id = public.auth_organisation_id()
    AND public.auth_role() IN ('company_admin', 'recruiter', 'hiring_manager', 'super_admin')
  );

ALTER TABLE public.offer_pdf_template_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offer pdf template versions read" ON public.offer_pdf_template_versions;
CREATE POLICY "offer pdf template versions read"
  ON public.offer_pdf_template_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.offer_pdf_templates t
      WHERE t.id = offer_pdf_template_versions.template_id
        AND t.organisation_id = public.auth_organisation_id()
        AND public.auth_role() IN (
          'company_admin', 'recruiter', 'hiring_manager', 'finance', 'super_admin'
        )
    )
  );

DROP POLICY IF EXISTS "offer pdf template versions insert" ON public.offer_pdf_template_versions;
CREATE POLICY "offer pdf template versions insert"
  ON public.offer_pdf_template_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.offer_pdf_templates t
      WHERE t.id = offer_pdf_template_versions.template_id
        AND t.organisation_id = public.auth_organisation_id()
        AND public.auth_role() IN ('company_admin', 'recruiter', 'hiring_manager', 'super_admin')
    )
  );

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS offer_pdf_template_id uuid REFERENCES public.offer_pdf_templates (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_offers_pdf_template ON public.offers (offer_pdf_template_id)
  WHERE offer_pdf_template_id IS NOT NULL;

COMMENT ON COLUMN public.offers.offer_pdf_template_id IS 'B2: optional override; NULL uses org default template.';

ALTER TABLE public.offer_document_versions
  ADD COLUMN IF NOT EXISTS document_url text,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'generated';

ALTER TABLE public.offer_document_versions DROP CONSTRAINT IF EXISTS offer_document_versions_kind_check;
ALTER TABLE public.offer_document_versions
  ADD CONSTRAINT offer_document_versions_kind_check
  CHECK (kind IN ('generated', 'signed'));

COMMENT ON COLUMN public.offer_document_versions.document_url IS 'B2: external URL (e.g. DocuSign) when not in storage.';
COMMENT ON COLUMN public.offer_document_versions.kind IS 'generated = TigerHire PDF; signed = e-sign completion.';

COMMIT;
