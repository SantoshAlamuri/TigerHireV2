-- Adds explicit deny policies for tables that have RLS enabled but no policies.
-- This preserves current behavior (no access) while making intent explicit.
-- Forward-only migration.
-- Manual rollback: drop the policies created below.

drop policy if exists approval_tokens_deny_authenticated_all on public.approval_tokens;
create policy approval_tokens_deny_authenticated_all
  on public.approval_tokens
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists billing_plans_deny_authenticated_all on public.billing_plans;
create policy billing_plans_deny_authenticated_all
  on public.billing_plans
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists blocked_public_domains_deny_authenticated_all on public.blocked_public_domains;
create policy blocked_public_domains_deny_authenticated_all
  on public.blocked_public_domains
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists idempotency_keys_deny_authenticated_all on public.idempotency_keys;
create policy idempotency_keys_deny_authenticated_all
  on public.idempotency_keys
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists job_referral_config_deny_authenticated_all on public.job_referral_config;
create policy job_referral_config_deny_authenticated_all
  on public.job_referral_config
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists payout_ledger_deny_authenticated_all on public.payout_ledger;
create policy payout_ledger_deny_authenticated_all
  on public.payout_ledger
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists referral_links_deny_authenticated_all on public.referral_links;
create policy referral_links_deny_authenticated_all
  on public.referral_links
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists referrer_magic_links_deny_authenticated_all on public.referrer_magic_links;
create policy referrer_magic_links_deny_authenticated_all
  on public.referrer_magic_links
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists referrer_otp_deny_authenticated_all on public.referrer_otp;
create policy referrer_otp_deny_authenticated_all
  on public.referrer_otp
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists referrers_deny_authenticated_all on public.referrers;
create policy referrers_deny_authenticated_all
  on public.referrers
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists whatsapp_message_log_deny_authenticated_all on public.whatsapp_message_log;
create policy whatsapp_message_log_deny_authenticated_all
  on public.whatsapp_message_log
  for all
  to authenticated
  using (false)
  with check (false);
