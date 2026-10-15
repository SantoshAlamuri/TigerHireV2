-- Per-job referral bonus amounts and milestone (optional row per job; no row = no bonus program).

CREATE TABLE IF NOT EXISTS job_referral_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES jobs (id) ON DELETE CASCADE,
  direct_bonus_amount numeric(10, 2) NOT NULL DEFAULT 0,
  parent_bonus_amount numeric(10, 2) NOT NULL DEFAULT 0,
  bonus_trigger text NOT NULL DEFAULT 'offer_accepted' CHECK (
    bonus_trigger IN ('shortlisted', 'offer_accepted', 'day_90')
  ),
  bonus_currency text NOT NULL DEFAULT 'INR',
  bonus_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE job_referral_config IS 'Optional per-job referral payouts; milestone handlers must skip if no row for job_id.';
COMMENT ON COLUMN job_referral_config.direct_bonus_amount IS 'Bonus for direct referrer when bonus_trigger fires.';
COMMENT ON COLUMN job_referral_config.parent_bonus_amount IS 'Bonus for parent (2nd-level) referrer when bonus_trigger fires.';
COMMENT ON COLUMN job_referral_config.bonus_trigger IS 'Milestone that creates payout_ledger rows: shortlisted | offer_accepted | day_90.';
COMMENT ON COLUMN job_referral_config.bonus_notes IS 'e.g. paid after 90-day retention confirmation';

-- payout_export: include configured bonus amounts; LEFT JOIN so ledger rows always listed.
DROP VIEW IF EXISTS payout_export;

CREATE VIEW payout_export AS
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
  c.email AS candidate_email,
  jrc.direct_bonus_amount,
  jrc.parent_bonus_amount
FROM payout_ledger pl
JOIN referrers r ON r.id = pl.referrer_id
JOIN candidates c ON c.id = pl.candidate_id
LEFT JOIN LATERAL (
  SELECT a.job_id
  FROM applications a
  WHERE a.candidate_id = pl.candidate_id
  ORDER BY a.updated_at DESC NULLS LAST
  LIMIT 1
) latest_app ON true
LEFT JOIN job_referral_config jrc ON jrc.job_id = latest_app.job_id;

COMMENT ON VIEW payout_export IS 'Ledger + referrer + candidate + optional job bonus config (latest application job per candidate).';
