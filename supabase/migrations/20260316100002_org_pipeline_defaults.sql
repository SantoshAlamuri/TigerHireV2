-- Organisation-level default pipeline stages
-- When a new job is created, these defaults are copied as the job's pipeline stages.
CREATE TABLE IF NOT EXISTS org_pipeline_stage_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  stage_name text NOT NULL CHECK (char_length(stage_name) > 0),
  stage_order int NOT NULL DEFAULT 0,
  interviewer_email text,
  interviewer_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_pipeline_defaults_org
  ON org_pipeline_stage_defaults(organisation_id);

ALTER TABLE org_pipeline_stage_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read their org defaults" ON org_pipeline_stage_defaults;
CREATE POLICY "Org members can read their org defaults"
  ON org_pipeline_stage_defaults FOR SELECT
  USING (
    organisation_id = (
      SELECT organisation_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage org defaults" ON org_pipeline_stage_defaults;
CREATE POLICY "Admins can manage org defaults"
  ON org_pipeline_stage_defaults FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.organisation_id = org_pipeline_stage_defaults.organisation_id
      AND p.role IN ('super_admin', 'company_admin')
    )
  );
