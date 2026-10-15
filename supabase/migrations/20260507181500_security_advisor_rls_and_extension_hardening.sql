-- Clear remaining advisor items that are safe to enforce centrally:
-- 1) Add explicit deny-all RLS policies to tables with RLS enabled/no policy.
-- 2) Move citext extension out of public schema.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dimension_node',
    'evidence_to_dimension_link',
    'evidence_type',
    'fit_scores_v2',
    'organisation_billing_profiles',
    'organisation_credit_ledger',
    'organisation_credit_wallets',
    'pending_jd_approval',
    'rubric_version',
    'scoring_config',
    'scoring_dlq',
    'support_requests'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = 'rls_deny_all_default'
    ) THEN
      EXECUTE format(
        'CREATE POLICY rls_deny_all_default ON public.%I AS RESTRICTIVE FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);',
        t
      );
    END IF;
  END LOOP;
END $$;

ALTER EXTENSION citext SET SCHEMA extensions;
