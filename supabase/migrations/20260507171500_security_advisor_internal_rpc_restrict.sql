-- Restrict internal SECURITY DEFINER routines to service_role only.
-- These functions are backend/maintenance/trigger internals and should not be
-- callable by anon/authenticated roles through PostgREST RPC.

REVOKE EXECUTE ON FUNCTION public.acquire_cron_lease(text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_cron_lease(text, text, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_cron_lease(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_cron_lease(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.platform_onboard_company(text, text, text, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_onboard_company(text, text, text, uuid, text, text, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.webhook_event_try_acquire(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.webhook_event_try_acquire(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.stripe_event_try_acquire(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stripe_event_try_acquire(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.recalculate_all_trust_scores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_all_trust_scores() TO service_role;

REVOKE EXECUTE ON FUNCTION public.refresh_learning_index() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_learning_index() TO service_role;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;

REVOKE EXECUTE ON FUNCTION public.trg_create_offer_finance_workflow() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_create_offer_finance_workflow() TO service_role;

REVOKE EXECUTE ON FUNCTION public.trg_organisations_seed_pipeline_defaults() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_organisations_seed_pipeline_defaults() TO service_role;
