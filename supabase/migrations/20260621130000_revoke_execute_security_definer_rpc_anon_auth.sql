-- Security hardening: lock down SECURITY DEFINER functions that bypass RLS so
-- they can no longer be invoked directly via PostgREST (/rest/v1/rpc/*) by anon
-- or authenticated. Every function below is already called server-side via the
-- service-role admin client (verified against src/ call sites 2026-06-21), so
-- the application is unaffected; service_role retains EXECUTE.
--
-- EXCLUDED (intentionally still executable by authenticated):
--   * RLS helper functions used inside policies (auth_role, auth_organisation_id,
--     auth_organisation_ids, auth_is_platform_admin, auth_can_see_organisation,
--     auth_role_status, can_caller_orgs_access_candidate,
--     can_caller_orgs_access_candidate_resume, can_org_access_candidate)
--   * get_accessible_candidate_ids / list_accessible_candidate_ids_page — these
--     are called via the USER client and need a code change (route them through
--     the admin client) before they can be revoked. Handled separately.
do $$
declare
  fn_names text[] := array[
    -- auth throttle / rate limiting
    'clear_login_failures','record_login_failure','get_auth_lock_status',
    'reserve_password_reset_cooldown','check_rate_limit_atomic',
    -- cron / locks / idempotency
    'acquire_cron_lease','release_cron_lease','stripe_event_try_acquire',
    'webhook_event_try_acquire','try_acquire_fit_score_scoring_lock',
    'release_fit_score_scoring_lock',
    -- provisioning / onboarding
    'platform_onboard_company','register_create_org_and_profile',
    'oauth_provision_profile_from_sso','onboard_employee_tx',
    'seed_org_default_pipeline_stages','allocate_hiring_request_code',
    -- billing
    'stripe_checkout_candidate','stripe_checkout_company',
    -- transactions / workflow / writers
    'update_application_status_tx','upsert_hiring_outcome_signal',
    'complete_voice_screening_job','switch_default_resume',
    'th_book_interview_slot','th_cancel_interview_slot','th_reschedule_interview_slot',
    -- maintenance / internal
    'recalculate_all_trust_scores','refresh_learning_index',
    -- trigger functions (fire regardless of EXECUTE; revoke from public too)
    'log_profile_insert','log_profile_update','log_profile_delete',
    'trg_create_offer_finance_workflow','trg_organisations_seed_pipeline_defaults',
    'rls_auto_enable'
  ];
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(fn_names)
  loop
    execute format('revoke execute on function %s from anon, authenticated, public;', r.sig);
  end loop;
end $$;
