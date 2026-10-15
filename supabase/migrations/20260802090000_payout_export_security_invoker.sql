-- Repair: payout_export lost security_invoker when 20260801120000 recreated it.
--
-- That migration does DROP VIEW + CREATE VIEW. DROP discards reloptions, so the
-- security_invoker=true the view previously carried was silently dropped and the
-- view began executing with its owner's privileges — bypassing RLS on
-- payout_ledger, referrers, candidates and jobs. Any authenticated user could
-- read every organisation's referral payouts: referrer identity, candidate, job
-- and amount.
--
-- Found by scripts/schema-drift-check.mjs, which asserts that no view in public
-- lacks security_invoker.
--
-- Already applied to Sydney preview (where 20260801120000 had run). Prod Mumbai
-- had not yet taken 20260801120000, so it was never exposed; applying both files
-- in order leaves it correct. Idempotent.

ALTER VIEW public.payout_export SET (security_invoker = true);
