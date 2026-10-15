-- Referral identity layer: referrers, shareable referral links, application attribution.

-- ---------------------------------------------------------------------------
-- 1) referrers — who can refer (employee, freelancer, agency) with optional chain
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS referrers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('employee', 'freelancer', 'agency')),
  parent_referrer_id uuid REFERENCES referrers (id) ON DELETE SET NULL,
  upi_id text,
  whatsapp_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrers_parent_referrer_id ON referrers (parent_referrer_id)
  WHERE parent_referrer_id IS NOT NULL;

COMMENT ON TABLE referrers IS 'Referral identity: type employee | freelancer | agency; optional parent for second-level attribution.';
COMMENT ON COLUMN referrers.type IS 'employee | freelancer | agency';

-- ---------------------------------------------------------------------------
-- 2) referral_links — opaque tokens tied to a referrer and job
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS referral_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  referrer_id uuid NOT NULL REFERENCES referrers (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_links_referrer_id ON referral_links (referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_links_job_id ON referral_links (job_id);

COMMENT ON TABLE referral_links IS 'Shareable ?ref=token links; optional expires_at.';

-- ---------------------------------------------------------------------------
-- 3) applications — persisted attribution (lookup at apply time)
-- ---------------------------------------------------------------------------

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS referral_link_id uuid REFERENCES referral_links (id) ON DELETE SET NULL;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS direct_referrer_id uuid REFERENCES referrers (id) ON DELETE SET NULL;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS parent_referrer_id uuid REFERENCES referrers (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_applications_referral_link_id ON applications (referral_link_id)
  WHERE referral_link_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_direct_referrer_id ON applications (direct_referrer_id)
  WHERE direct_referrer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_parent_referrer_id ON applications (parent_referrer_id)
  WHERE parent_referrer_id IS NOT NULL;

COMMENT ON COLUMN applications.referral_link_id IS 'Referral link used at apply time, if any.';
COMMENT ON COLUMN applications.direct_referrer_id IS 'Immediate referrer (from token → link → referrer).';
COMMENT ON COLUMN applications.parent_referrer_id IS 'Optional upstream referrer in the chain at time of apply.';
