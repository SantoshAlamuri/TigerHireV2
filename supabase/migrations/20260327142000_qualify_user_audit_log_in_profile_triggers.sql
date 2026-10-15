-- Fix Auth-user deletion failures caused by trigger function search_path.
-- Explicitly reference public.user_audit_log in profile audit triggers.

CREATE OR REPLACE FUNCTION public.log_profile_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_audit_log (user_id, action, new_data, changed_by)
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

CREATE OR REPLACE FUNCTION public.log_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  log_action text := 'updated';
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    log_action := 'role_changed';
  ELSIF OLD.organisation_id IS DISTINCT FROM NEW.organisation_id THEN
    log_action := 'org_changed';
  END IF;

  INSERT INTO public.user_audit_log (user_id, action, old_data, new_data, changed_by)
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

CREATE OR REPLACE FUNCTION public.log_profile_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_audit_log (user_id, action, old_data, changed_by)
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
