-- Referral payout runs: the half of the pipeline that never existed.
--
-- Until now `payout_ledger.status` was written 'pending' at creation by
-- payout-trigger and never written again, by anything. The CHECK constraint has
-- allowed 'confirmed' and 'paid' since March; no code path ever set either. The
-- consequences were all silent:
--
--   * the company CSV filters status='pending', so every download returned the
--     same rows forever — a re-payment hazard under the old model where the
--     company's finance team paid from that file;
--   * the referrer's own dashboard shows "paid earnings" — permanently 0;
--   * the public leaderboard's paid totals — permanently empty;
--   * EmployeeReferralBoardService's paid/pending split — everything pending.
--
-- TigerHire now makes the payouts, so this adds the operator-side run:
--   pending --(company confirms the hire)--> confirmed
--         --(operator generates a batch)--> assigned to a payout_batch
--         --(operator pays out, records it)--> paid
--
-- `job_id` on the ledger is the other half of the fix. Payout rows carried no
-- job, so payout_export guessed one via "latest application by this candidate"
-- — a LATERAL join that silently picks the wrong role when a candidate applied
-- to more than one. A finance statement that allocates cost to the wrong role is
-- worse than one that omits it, and the trigger knew the job all along.

-- ---------------------------------------------------------------------------
-- payout_batches: the unit of reconciliation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'cancelled')),
  currency text NOT NULL DEFAULT 'INR',
  total_amount numeric(12, 2) NOT NULL DEFAULT 0,
  row_count integer NOT NULL DEFAULT 0,
  note text,
  payment_reference text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE payout_batches IS 'A TigerHire payout run: confirmed ledger rows grouped, disbursed outside the app, then marked paid.';
COMMENT ON COLUMN payout_batches.reference IS 'Human-readable run id shown to operators and printed on the company statement, e.g. PR-2026-08-0001.';
COMMENT ON COLUMN payout_batches.total_amount IS 'Sum of member ledger amounts, frozen when the batch is generated.';
COMMENT ON COLUMN payout_batches.payment_reference IS 'Operator-entered UTR / transaction reference for the disbursement.';
COMMENT ON COLUMN payout_batches.paid_at IS 'Set when the operator confirms the run was disbursed; mirrored onto member ledger rows.';

CREATE INDEX IF NOT EXISTS idx_payout_batches_status ON payout_batches (status);
CREATE INDEX IF NOT EXISTS idx_payout_batches_created_at ON payout_batches (created_at DESC);

-- Service-role only, matching payout_ledger's posture (see
-- 20260418221000_explicit_deny_policies_for_rls_tables.sql). Payout data is
-- operator-facing; every read in the product goes through an admin client.
ALTER TABLE payout_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payout_batches_deny_authenticated_all ON public.payout_batches;
CREATE POLICY payout_batches_deny_authenticated_all
  ON public.payout_batches
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- payout_ledger: lifecycle columns + the job the bonus was earned on
-- ---------------------------------------------------------------------------
ALTER TABLE payout_ledger
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES payout_batches (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

COMMENT ON COLUMN payout_ledger.job_id IS 'Job whose referral config produced this payout. Null only for rows created before 2026-08-01.';
COMMENT ON COLUMN payout_ledger.batch_id IS 'Payout run this row was disbursed in; null while pending or confirmed.';
COMMENT ON COLUMN payout_ledger.confirmed_at IS 'When the company confirmed the milestone was real. Gate for entering a payout run.';
COMMENT ON COLUMN payout_ledger.paid_at IS 'When the batch carrying this row was marked paid.';

CREATE INDEX IF NOT EXISTS idx_payout_ledger_batch_id ON payout_ledger (batch_id);
CREATE INDEX IF NOT EXISTS idx_payout_ledger_job_id ON payout_ledger (job_id);
-- The operator's queue: confirmed rows not yet in a run.
CREATE INDEX IF NOT EXISTS idx_payout_ledger_unbatched
  ON payout_ledger (status)
  WHERE batch_id IS NULL;

-- Backfill job_id for existing rows using the same "latest application" guess
-- the view was already making. This does not make old rows correct — it makes
-- them no worse than the view they were rendered through, and every row created
-- from now on carries the true job. Rows whose candidate has no application
-- stay null and render as "—" rather than borrowing another role's title.
-- Correlated subquery rather than the view's `FROM LATERAL (...)`: Postgres
-- forbids a lateral item in an UPDATE's FROM clause from referencing the update
-- target, so the view's own shape does not transplant into an UPDATE.
UPDATE payout_ledger pl
SET job_id = (
  SELECT a.job_id
  FROM applications a
  WHERE a.candidate_id = pl.candidate_id
  ORDER BY a.updated_at DESC NULLS LAST
  LIMIT 1
)
WHERE pl.job_id IS NULL
  AND EXISTS (
    SELECT 1 FROM applications a WHERE a.candidate_id = pl.candidate_id
  );

-- ---------------------------------------------------------------------------
-- payout_export: join the job directly, and carry the run
-- ---------------------------------------------------------------------------
-- organisation_id is exposed so callers can filter by tenant in one predicate
-- instead of the two-hop jobs->applications->candidate_id IN (...) chunked scan
-- the export route does today.
DROP VIEW IF EXISTS payout_export;

-- security_invoker is mandatory here and is NOT inherited: DROP VIEW discards
-- reloptions, so recreating without it silently reverts the view to executing
-- with its owner's privileges, bypassing RLS on payout_ledger, referrers,
-- candidates and jobs — every organisation's payouts readable by any
-- authenticated user. Environments that already ran this file are repaired by
-- 20260802090000_payout_export_security_invoker.sql.
CREATE VIEW payout_export WITH (security_invoker = true) AS
SELECT
  pl.id AS ledger_id,
  pl.candidate_id,
  pl.referrer_id,
  pl.referrer_level,
  pl.trigger_event,
  pl.amount,
  pl.currency,
  pl.status,
  pl.notes,
  pl.created_at,
  pl.updated_at,
  pl.confirmed_at,
  pl.paid_at,
  pl.job_id,
  j.title AS job_title,
  j.organisation_id,
  pl.batch_id,
  b.reference AS batch_reference,
  b.payment_reference,
  b.paid_at AS batch_paid_at,
  r.name AS referrer_name,
  r.upi_id AS referrer_upi_id,
  r.whatsapp_number AS referrer_whatsapp_number,
  COALESCE(c.full_name, c.name) AS candidate_name,
  c.email AS candidate_email,
  jrc.direct_bonus_amount,
  jrc.parent_bonus_amount
FROM payout_ledger pl
JOIN referrers r ON r.id = pl.referrer_id
JOIN candidates c ON c.id = pl.candidate_id
LEFT JOIN jobs j ON j.id = pl.job_id
LEFT JOIN payout_batches b ON b.id = pl.batch_id
LEFT JOIN job_referral_config jrc ON jrc.job_id = pl.job_id;

COMMENT ON VIEW payout_export IS 'Ledger + referrer + candidate + job + payout run. job_id is now stored on the ledger, not guessed from the latest application.';
