-- Optional: store Stripe plan config in DB so non-devs can change limits without code deploy.
-- App falls back to env (STRIPE_PRICE_*) when this table is empty.
CREATE TABLE IF NOT EXISTS billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key text NOT NULL,
  plan_type text NOT NULL CHECK (plan_type IN ('company', 'candidate')),
  stripe_price_id text NOT NULL,
  name text NOT NULL,
  limits jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_key, plan_type)
);

CREATE INDEX IF NOT EXISTS idx_billing_plans_plan_type ON billing_plans (plan_type);

COMMENT ON TABLE billing_plans IS 'Stripe plan config; app uses env fallback when empty. limits: company has unlocks (number), candidate {}.';
