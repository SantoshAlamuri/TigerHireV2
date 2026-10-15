-- Login lockout and forgot-password cooldown controls.

CREATE TABLE IF NOT EXISTS public.auth_security_state (
  email text PRIMARY KEY,
  failed_login_count integer NOT NULL DEFAULT 0,
  first_failed_at timestamptz NULL,
  locked_until timestamptz NULL,
  reset_email_cooldown_until timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_auth_security_state_locked_until
  ON public.auth_security_state (locked_until);

CREATE INDEX IF NOT EXISTS idx_auth_security_state_reset_cooldown_until
  ON public.auth_security_state (reset_email_cooldown_until);

ALTER TABLE public.auth_security_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage auth_security_state" ON public.auth_security_state;
CREATE POLICY "Service role can manage auth_security_state"
  ON public.auth_security_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.get_auth_lock_status(
  p_email text
)
RETURNS TABLE(locked boolean, locked_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  state_row public.auth_security_state%ROWTYPE;
BEGIN
  SELECT * INTO state_row
  FROM public.auth_security_state
  WHERE email = lower(trim(p_email));

  IF NOT FOUND THEN
    RETURN QUERY SELECT false::boolean, NULL::timestamptz;
    RETURN;
  END IF;

  IF state_row.locked_until IS NOT NULL AND state_row.locked_until > timezone('utc', now()) THEN
    RETURN QUERY SELECT true::boolean, state_row.locked_until;
  ELSE
    RETURN QUERY SELECT false::boolean, NULL::timestamptz;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_login_failure(
  p_email text,
  p_max_attempts integer DEFAULT 5,
  p_window_minutes integer DEFAULT 15,
  p_lock_minutes integer DEFAULT 30
)
RETURNS TABLE(locked boolean, remaining_attempts integer, locked_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  norm_email text := lower(trim(p_email));
  now_ts timestamptz := timezone('utc', now());
  window_start timestamptz := now_ts - make_interval(mins => GREATEST(p_window_minutes, 1));
  state_row public.auth_security_state%ROWTYPE;
  next_count integer;
  next_first_failed timestamptz;
  next_locked_until timestamptz;
BEGIN
  INSERT INTO public.auth_security_state (email, failed_login_count, first_failed_at, updated_at)
  VALUES (norm_email, 0, NULL, now_ts)
  ON CONFLICT (email) DO NOTHING;

  SELECT * INTO state_row
  FROM public.auth_security_state
  WHERE email = norm_email
  FOR UPDATE;

  IF state_row.locked_until IS NOT NULL AND state_row.locked_until > now_ts THEN
    RETURN QUERY
      SELECT true::boolean, 0::integer, state_row.locked_until;
    RETURN;
  END IF;

  IF state_row.first_failed_at IS NULL OR state_row.first_failed_at < window_start THEN
    next_count := 1;
    next_first_failed := now_ts;
  ELSE
    next_count := state_row.failed_login_count + 1;
    next_first_failed := state_row.first_failed_at;
  END IF;

  IF next_count >= GREATEST(p_max_attempts, 1) THEN
    next_locked_until := now_ts + make_interval(mins => GREATEST(p_lock_minutes, 1));
  ELSE
    next_locked_until := NULL;
  END IF;

  UPDATE public.auth_security_state
  SET
    failed_login_count = next_count,
    first_failed_at = next_first_failed,
    locked_until = next_locked_until,
    updated_at = now_ts
  WHERE email = norm_email;

  RETURN QUERY
    SELECT
      (next_locked_until IS NOT NULL AND next_locked_until > now_ts) AS locked,
      GREATEST(0, GREATEST(p_max_attempts, 1) - next_count) AS remaining_attempts,
      next_locked_until;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_login_failures(
  p_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.auth_security_state
  SET
    failed_login_count = 0,
    first_failed_at = NULL,
    locked_until = NULL,
    updated_at = timezone('utc', now())
  WHERE email = lower(trim(p_email));
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_password_reset_cooldown(
  p_email text,
  p_cooldown_seconds integer DEFAULT 300
)
RETURNS TABLE(allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  norm_email text := lower(trim(p_email));
  now_ts timestamptz := timezone('utc', now());
  state_row public.auth_security_state%ROWTYPE;
  next_cooldown_until timestamptz := now_ts + make_interval(secs => GREATEST(p_cooldown_seconds, 1));
  wait_seconds integer;
BEGIN
  INSERT INTO public.auth_security_state (email, failed_login_count, first_failed_at, updated_at)
  VALUES (norm_email, 0, NULL, now_ts)
  ON CONFLICT (email) DO NOTHING;

  SELECT * INTO state_row
  FROM public.auth_security_state
  WHERE email = norm_email
  FOR UPDATE;

  IF state_row.reset_email_cooldown_until IS NOT NULL
     AND state_row.reset_email_cooldown_until > now_ts THEN
    wait_seconds := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (state_row.reset_email_cooldown_until - now_ts)))::integer);
    RETURN QUERY SELECT false::boolean, wait_seconds;
    RETURN;
  END IF;

  UPDATE public.auth_security_state
  SET
    reset_email_cooldown_until = next_cooldown_until,
    updated_at = now_ts
  WHERE email = norm_email;

  RETURN QUERY SELECT true::boolean, 0::integer;
END;
$$;

REVOKE ALL ON FUNCTION public.get_auth_lock_status(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_lock_status(text)
  TO authenticated, service_role, postgres;

REVOKE ALL ON FUNCTION public.record_login_failure(text, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_login_failure(text, integer, integer, integer)
  TO authenticated, service_role, postgres;

REVOKE ALL ON FUNCTION public.clear_login_failures(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_login_failures(text)
  TO authenticated, service_role, postgres;

REVOKE ALL ON FUNCTION public.reserve_password_reset_cooldown(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_password_reset_cooldown(text, integer)
  TO authenticated, service_role, postgres;

COMMENT ON TABLE public.auth_security_state IS
  'Security controls for login lockout and password-reset email cooldown by normalized email.';
