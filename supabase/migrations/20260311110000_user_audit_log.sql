-- User audit log: tracks all lifecycle events on profiles (create, update, delete).
-- Captures who changed, what changed, and when — to detect unexpected user loss.

CREATE TABLE IF NOT EXISTS user_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'role_changed', 'org_changed')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,               -- NULL for system/trigger-level changes
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_audit_log_user_id ON user_audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_action ON user_audit_log (action);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_created_at ON user_audit_log (created_at DESC);

ALTER TABLE user_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role and super_admin can read
DROP POLICY IF EXISTS "Service role can manage user audit log" ON user_audit_log;
CREATE POLICY "Service role can manage user audit log"
  ON user_audit_log FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Super admin can read user audit log" ON user_audit_log;
CREATE POLICY "Super admin can read user audit log"
  ON user_audit_log FOR SELECT
  USING (public.auth_role() = 'super_admin');

COMMENT ON TABLE user_audit_log IS 'Tracks all user lifecycle events: creation, updates, deletion, role changes. For security monitoring and incident investigation.';

-- ─── Trigger function: log profile inserts ───
CREATE OR REPLACE FUNCTION log_profile_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_audit_log (user_id, action, new_data, changed_by)
  VALUES (
    NEW.id,
    'created',
    jsonb_build_object(
      'role', NEW.role,
      'organisation_id', NEW.organisation_id,
      'full_name', NEW.full_name
    ),
    auth.uid()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_insert ON profiles;
CREATE TRIGGER trg_profile_insert
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION log_profile_insert();

-- ─── Trigger function: log profile updates ───
CREATE OR REPLACE FUNCTION log_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  log_action text := 'updated';
BEGIN
  -- Classify the change
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    log_action := 'role_changed';
  ELSIF OLD.organisation_id IS DISTINCT FROM NEW.organisation_id THEN
    log_action := 'org_changed';
  END IF;

  INSERT INTO user_audit_log (user_id, action, old_data, new_data, changed_by)
  VALUES (
    NEW.id,
    log_action,
    jsonb_build_object(
      'role', OLD.role,
      'organisation_id', OLD.organisation_id,
      'full_name', OLD.full_name
    ),
    jsonb_build_object(
      'role', NEW.role,
      'organisation_id', NEW.organisation_id,
      'full_name', NEW.full_name
    ),
    auth.uid()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_update ON profiles;
CREATE TRIGGER trg_profile_update
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION log_profile_update();

-- ─── Trigger function: log profile deletes ───
CREATE OR REPLACE FUNCTION log_profile_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_audit_log (user_id, action, old_data, changed_by)
  VALUES (
    OLD.id,
    'deleted',
    jsonb_build_object(
      'role', OLD.role,
      'organisation_id', OLD.organisation_id,
      'full_name', OLD.full_name,
      'created_at', OLD.created_at
    ),
    auth.uid()
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_delete ON profiles;
CREATE TRIGGER trg_profile_delete
  BEFORE DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION log_profile_delete();
