-- Referral payout ledger (manual confirmation workflow; RLS to be added later).

CREATE TABLE IF NOT EXISTS payout_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES referrers (id) ON DELETE CASCADE,
  referrer_level text NOT NULL CHECK (referrer_level IN ('direct', 'parent')),
  trigger_event text NOT NULL CHECK (trigger_event IN ('shortlisted', 'offer_accepted', 'day_90')),
  amount numeric(10, 2),
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'paid')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_ledger_referrer_id ON payout_ledger (referrer_id);
CREATE INDEX IF NOT EXISTS idx_payout_ledger_candidate_id ON payout_ledger (candidate_id);
CREATE INDEX IF NOT EXISTS idx_payout_ledger_status ON payout_ledger (status);

COMMENT ON TABLE payout_ledger IS 'Referrer payout rows per milestone; amount set when employer confirms.';
COMMENT ON COLUMN payout_ledger.referrer_level IS 'direct | parent';
COMMENT ON COLUMN payout_ledger.trigger_event IS 'shortlisted | offer_accepted | day_90';
COMMENT ON COLUMN payout_ledger.amount IS 'Payout amount; null until employer confirms.';
COMMENT ON COLUMN payout_ledger.status IS 'pending | confirmed | paid';

-- Recruiter CSV export: one query over ledger + referrer payout details + candidate identity.
CREATE OR REPLACE VIEW payout_export AS
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
  r.name AS referrer_name,
  r.upi_id AS referrer_upi_id,
  r.whatsapp_number AS referrer_whatsapp_number,
  COALESCE(c.full_name, c.name) AS candidate_name,
  c.email AS candidate_email
FROM payout_ledger pl
JOIN referrers r ON r.id = pl.referrer_id
JOIN candidates c ON c.id = pl.candidate_id;

COMMENT ON VIEW payout_export IS 'Join payout_ledger with referrers and candidates for CSV export.';
