-- Subscriptions: Stripe-backed company and candidate plans.

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES organisations (id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  stripe_subscription_id text,
  stripe_customer_id text,
  company_plan company_plan,
  candidate_plan candidate_plan,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_org_or_user CHECK (
    (organisation_id IS NOT NULL AND user_id IS NULL) OR
    (organisation_id IS NULL AND user_id IS NOT NULL)
  )
);

CREATE INDEX idx_subscriptions_organisation_id ON subscriptions (organisation_id);
CREATE INDEX idx_subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON TABLE subscriptions IS 'Company plan (org) or candidate Pro plan (user). One of organisation_id or user_id set.';
