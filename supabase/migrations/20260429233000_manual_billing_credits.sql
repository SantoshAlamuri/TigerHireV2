-- Manual billing profiles and credit wallets for platform-admin operations.

CREATE TABLE IF NOT EXISTS public.organisation_billing_profiles (
  organisation_id uuid PRIMARY KEY REFERENCES public.organisations (id) ON DELETE CASCADE,
  billing_mode text NOT NULL DEFAULT 'automated' CHECK (billing_mode IN ('automated', 'manual')),
  customer_type text NOT NULL DEFAULT 'standard',
  unlock_credits_monthly integer NOT NULL DEFAULT 0 CHECK (unlock_credits_monthly >= 0),
  job_credits_monthly integer NOT NULL DEFAULT 0 CHECK (job_credits_monthly >= 0),
  allow_negative_balance boolean NOT NULL DEFAULT false,
  notes text,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organisation_billing_profiles IS
  'Per-organisation billing mode and manual credit policy controlled by super admin.';

CREATE TABLE IF NOT EXISTS public.organisation_credit_wallets (
  organisation_id uuid PRIMARY KEY REFERENCES public.organisations (id) ON DELETE CASCADE,
  unlock_balance integer NOT NULL DEFAULT 0,
  job_balance integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organisation_credit_wallets IS
  'Current manual credit balances by organisation. Positive/negative supported by policy.';

CREATE TABLE IF NOT EXISTS public.organisation_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  credit_type text NOT NULL CHECK (credit_type IN ('unlock', 'job')),
  entry_type text NOT NULL CHECK (entry_type IN ('grant', 'consume', 'adjust', 'expire', 'reset')),
  delta integer NOT NULL,
  balance_after integer NOT NULL,
  reason text NOT NULL DEFAULT '',
  reference_type text,
  reference_id text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_credit_ledger_org_created_at
  ON public.organisation_credit_ledger (organisation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_org_credit_ledger_org_type
  ON public.organisation_credit_ledger (organisation_id, credit_type, created_at DESC);

ALTER TABLE public.organisation_billing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_credit_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_credit_ledger ENABLE ROW LEVEL SECURITY;
