-- Restrict admin-only SECURITY DEFINER RPCs to service_role.

REVOKE EXECUTE ON FUNCTION public.allocate_hiring_request_code(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_hiring_request_code(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit_atomic(text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_atomic(text, timestamptz, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.clear_login_failures(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_login_failures(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_auth_lock_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_lock_status(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.oauth_provision_profile_from_sso(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oauth_provision_profile_from_sso(uuid, text, uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_login_failure(text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_failure(text, integer, integer, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.register_create_org_and_profile(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_create_org_and_profile(uuid, text, text, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.reserve_password_reset_cooldown(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_password_reset_cooldown(text, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.stripe_checkout_candidate(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stripe_checkout_candidate(uuid, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.stripe_checkout_company(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stripe_checkout_company(uuid, text, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_application_status_tx(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_application_status_tx(uuid, text, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.upsert_hiring_outcome_signal(uuid, uuid, uuid, text, uuid, smallint, integer, smallint, text, text, double precision, boolean, uuid, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hiring_outcome_signal(uuid, uuid, uuid, text, uuid, smallint, integer, smallint, text, text, double precision, boolean, uuid, timestamptz, text, text) TO service_role;
