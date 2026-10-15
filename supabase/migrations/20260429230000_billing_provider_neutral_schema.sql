-- Provider-neutral billing fields for Stripe + Razorpay parallel support.

ALTER TABLE public.billing_plans
ADD COLUMN IF NOT EXISTS razorpay_plan_id text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.billing_plans.razorpay_plan_id IS
  'Razorpay subscription plan identifier. Empty means not configured for that plan.';

ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'stripe',
ADD COLUMN IF NOT EXISTS provider_customer_id text,
ADD COLUMN IF NOT EXISTS provider_subscription_id text;

ALTER TABLE public.subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_provider_check;

ALTER TABLE public.subscriptions
ADD CONSTRAINT subscriptions_provider_check CHECK (provider IN ('stripe', 'razorpay'));

UPDATE public.subscriptions
SET
  provider = COALESCE(NULLIF(provider, ''), 'stripe'),
  provider_customer_id = COALESCE(provider_customer_id, stripe_customer_id),
  provider_subscription_id = COALESCE(provider_subscription_id, stripe_subscription_id)
WHERE
  provider IS DISTINCT FROM COALESCE(NULLIF(provider, ''), 'stripe')
  OR provider_customer_id IS DISTINCT FROM COALESCE(provider_customer_id, stripe_customer_id)
  OR provider_subscription_id IS DISTINCT FROM COALESCE(provider_subscription_id, stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON public.subscriptions (provider);

CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_subscription_id
  ON public.subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_provider_provider_subscription_unique
  ON public.subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

-- Provider-aware idempotency helper built on existing stripe_events table.
CREATE OR REPLACE FUNCTION public.webhook_event_try_acquire(p_provider text, p_event_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  event_key text;
  inserted integer;
BEGIN
  IF p_provider IS NULL OR p_event_id IS NULL THEN
    RETURN false;
  END IF;

  event_key := lower(trim(p_provider)) || ':' || trim(p_event_id);
  IF event_key IN ('stripe:', 'razorpay:') THEN
    RETURN false;
  END IF;

  INSERT INTO public.stripe_events (id) VALUES (event_key)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted > 0;
END;
$$;
