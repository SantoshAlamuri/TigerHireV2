-- FORWARD-ONLY MIGRATION WARNING:
-- This migration extends `offers.status` to include `pending_admin` and updates
-- the active-offers unique index predicate.
--
-- Rollback procedure (manual, only if absolutely required):
-- 1) Ensure no rows remain with status = 'pending_admin':
--      UPDATE public.offers SET status = 'pending_finance' WHERE status = 'pending_admin';
-- 2) Recreate `offers_status_check` without `pending_admin`.
-- 3) Recreate `idx_offers_application_active` predicate without `pending_admin`.
-- 4) Re-verify API/runtime paths that now expect `pending_admin`.
--
-- Do not auto-rollback in production; data/state reconciliation is required first.
BEGIN;

ALTER TABLE public.offers
  DROP CONSTRAINT IF EXISTS offers_status_check;

ALTER TABLE public.offers
  ADD CONSTRAINT offers_status_check
  CHECK (status IN (
    'draft',
    'pending_admin',
    'pending_finance',
    'approved',
    'rejected',
    'sent',
    'accepted',
    'declined',
    'expired',
    'negotiating',
    'withdrawn'
  ));

DROP INDEX IF EXISTS idx_offers_application_active;

CREATE UNIQUE INDEX idx_offers_application_active
  ON public.offers (application_id)
  WHERE status IN ('draft', 'pending_admin', 'pending_finance', 'approved', 'sent', 'negotiating');

COMMIT;
