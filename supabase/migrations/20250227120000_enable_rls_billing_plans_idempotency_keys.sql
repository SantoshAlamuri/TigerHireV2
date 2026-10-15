-- Enable RLS on billing_plans and idempotency_keys (Supabase linter: rls_disabled_in_public).
-- Both tables are accessed only via service-role (createSupabaseAdmin) in app code;
-- no permissive policies are added, so PostgREST with anon/authenticated keys cannot access them.

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
