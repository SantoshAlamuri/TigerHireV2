-- Audit log for PII access (unlocks, CV downloads).
-- GDPR Article 30: records of processing; dispute resolution; security.
CREATE TABLE access_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('unlock', 'download_cv', 'view_pii')),
  ip_address inet,
  user_agent text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_access_audit_log_user_id ON access_audit_log (user_id);
CREATE INDEX idx_access_audit_log_candidate_id ON access_audit_log (candidate_id);
CREATE INDEX idx_access_audit_log_created_at ON access_audit_log (created_at DESC);

ALTER TABLE access_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role and super_admin should read audit log (no SELECT for org members).
CREATE POLICY "Service role can manage audit log"
  ON access_audit_log FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE access_audit_log IS 'Who accessed candidate PII, when, and from where. For compliance and dispute resolution.';
