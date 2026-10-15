-- Restrict trigger/internal routines that should not be user-invokable via RPC.

REVOKE EXECUTE ON FUNCTION public.log_profile_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_profile_delete() TO service_role;

REVOKE EXECUTE ON FUNCTION public.log_profile_insert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_profile_insert() TO service_role;

REVOKE EXECUTE ON FUNCTION public.log_profile_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_profile_update() TO service_role;

REVOKE EXECUTE ON FUNCTION public.onboard_employee_tx(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.onboard_employee_tx(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.seed_org_default_pipeline_stages(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_org_default_pipeline_stages(uuid) TO service_role;
