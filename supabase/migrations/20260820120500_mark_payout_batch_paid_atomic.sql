-- Audit #344 — atomic payout batch settlement.
--
-- APPLIED via MCP to BOTH DBs on 2026-08-20 (prod Mumbai qzhhhsvtyqyixpcdfhng +
-- preview Sydney htdyomyhkvhcwoeodwas), verified callable (0 rows for a
-- non-existent batch, no side effects). ReferralPayoutService.markBatchPaid now
-- calls it via admin.rpc('mark_payout_batch_paid', ...).
--
-- markBatchPaid() previously flipped payout_batches.status to 'paid' first, then
-- updates payout_ledger in a SECOND round-trip. If the process dies between the
-- two, the batch reads 'paid' while referrers' ledger rows stay 'confirmed'
-- forever, and the status='open' guard prevents any re-run from repairing them.
-- This function does both updates in a single transaction so they cannot diverge.
--
-- After applying, switch src/lib/services/ReferralPayoutService.ts:markBatchPaid
-- to call this via admin.rpc('mark_payout_batch_paid', {...}) instead of the two
-- separate .update() calls.

create or replace function public.mark_payout_batch_paid(
  p_batch_id uuid,
  p_user_id uuid,
  p_payment_reference text,
  p_now timestamptz
)
returns setof public.payout_batches
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only touch the ledger if the batch is still open (single snapshot: the batch
  -- update below has not run yet within this transaction).
  update public.payout_ledger l
    set status = 'paid', paid_at = p_now, updated_at = p_now
    where l.batch_id = p_batch_id
      and exists (
        select 1 from public.payout_batches b
        where b.id = p_batch_id and b.status = 'open'
      );

  return query
    update public.payout_batches b
      set status = 'paid',
          paid_at = p_now,
          paid_by = p_user_id,
          payment_reference = btrim(p_payment_reference),
          updated_at = p_now
      where b.id = p_batch_id and b.status = 'open'
      returning b.*;
end;
$$;

revoke all on function public.mark_payout_batch_paid(uuid, uuid, text, timestamptz) from public, anon, authenticated;
