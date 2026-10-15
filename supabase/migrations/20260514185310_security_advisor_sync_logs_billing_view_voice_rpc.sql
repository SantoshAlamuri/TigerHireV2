-- Security advisor remediation:
-- 1) monthly_billing_audit: invoker semantics (matches other reporting views).
-- 2) sync_logs: RLS with explicit deny for client JWT roles; service_role bypasses RLS.
-- 3) complete_voice_screening_job: callable only from server (service_role); webhook uses admin client.
--
-- Auth: enable "Prevent use of leaked passwords" under Dashboard → Authentication → Providers → Email
-- (HaveIBeenPwned). Requires Supabase Pro+ per https://supabase.com/docs/guides/auth/password-security

ALTER VIEW IF EXISTS public.monthly_billing_audit
  SET (security_invoker = true);

ALTER TABLE IF EXISTS public.sync_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sync_logs'
      AND policyname = 'sync_logs_deny_clients_all'
  ) THEN
    CREATE POLICY sync_logs_deny_clients_all
      ON public.sync_logs
      AS RESTRICTIVE
      FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.complete_voice_screening_job(
  uuid,
  uuid,
  text,
  integer,
  numeric,
  text,
  text,
  jsonb,
  text,
  timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_voice_screening_job(
  uuid,
  uuid,
  text,
  integer,
  numeric,
  text,
  text,
  jsonb,
  text,
  timestamptz
) TO service_role;
