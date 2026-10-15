# Razorpay-First Rollout Runbook

## Goal

Run Razorpay as primary checkout for new cohorts while keeping Stripe available as a fast fallback.

## Controls

- `BILLING_DEFAULT_PROVIDER=razorpay` enables Razorpay-first routing.
- `BILLING_FORCE_STRIPE=true` is the emergency kill switch for new checkouts.
- Feature flag `billing_provider_razorpay` controls org-level Razorpay enablement (with org overrides).

## Stage rollout

1. **Stage 1 (internal orgs)**
   - Keep `BILLING_DEFAULT_PROVIDER=razorpay`.
   - Enable `billing_provider_razorpay` only for internal org IDs.
   - Validate: checkout URL creation, webhook processing, entitlement/unlock behavior.
2. **Stage 2 (1-2 India design partners)**
   - Enable org overrides for selected customer orgs.
   - Monitor webhook signature failures and duplicate event rate.
   - Confirm monthly quota enforcement after a failed/cancelled subscription.
3. **Stage 3 (broader India cohort)**
   - Move flag to global ON with selective OFF overrides as needed.
   - Review daily payment conversion and failure trends.
4. **Stage 4 (global strategy decision)**
   - Decide permanent routing model (Razorpay-first by region, dual-provider, or Stripe-default fallback).

## Operational checks

- Checkout logs: `Billing checkout provider resolved`, `Billing checkout URL created`.
- Webhook logs: `Stripe webhook processing`, `Razorpay webhook processing`, and duplicate/rejected events.
- Quota guardrail logs: `Candidate unlock blocked by monthly quota`.
- Entitlement decisions: `Entitlement decision` log stream.

## Incident playbook

1. **If Razorpay checkout creation fails**
   - Set `BILLING_FORCE_STRIPE=true`.
   - Redeploy and confirm new checkouts route to Stripe.
2. **If Razorpay webhooks fail signature checks**
   - Verify `RAZORPAY_WEBHOOK_SECRET` matches dashboard webhook secret.
   - Replay an event and confirm `received: true`.
3. **If paid orgs lose access unexpectedly**
   - Inspect `subscriptions.status` and `organisations.company_plan`.
   - Confirm webhook events are being acquired via `webhook_event_try_acquire`.
   - Re-run entitlement cache invalidation if needed.

## Rollback

- Immediate rollback path: set `BILLING_FORCE_STRIPE=true`.
- Keep webhook endpoints active during rollback to avoid dropping state transitions.
