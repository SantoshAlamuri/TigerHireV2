-- Restore missing user_audit_log table expected by profile audit triggers.
-- Missing table caused auth user deletion to fail with:
--   relation "user_audit_log" does not exist

CREATE TABLE IF NOT EXISTS public.user_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'role_changed', 'org_changed')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_audit_log_user_id ON public.user_audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_action ON public.user_audit_log (action);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_created_at ON public.user_audit_log (created_at DESC);

ALTER TABLE public.user_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_audit_log'
      AND policyname = 'Service role can manage user audit log'
  ) THEN
    CREATE POLICY "Service role can manage user audit log"
      ON public.user_audit_log FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_audit_log'
      AND policyname = 'Super admin can read user audit log'
  ) THEN
    CREATE POLICY "Super admin can read user audit log"
      ON public.user_audit_log FOR SELECT
      USING (public.auth_role() = 'super_admin');
  END IF;
END $$;

COMMENT ON TABLE public.user_audit_log IS 'Tracks all user lifecycle events: creation, updates, deletion, role changes. For security monitoring and incident investigation.';
