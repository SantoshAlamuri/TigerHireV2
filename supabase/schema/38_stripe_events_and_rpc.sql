-- Stripe webhook idempotency: store processed event IDs to avoid duplicate processing.
CREATE TABLE IF NOT EXISTS stripe_events (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE stripe_events IS 'Processed Stripe webhook event IDs for idempotency.';

-- Ensure subscriptions can be upserted by organisation_id or user_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_organisation_id_unique ON subscriptions (organisation_id) WHERE organisation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_id_unique ON subscriptions (user_id) WHERE user_id IS NOT NULL;

-- Returns true if event was newly inserted (should process), false if duplicate (skip).
CREATE OR REPLACE FUNCTION stripe_event_try_acquire(event_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inserted integer;
BEGIN
  INSERT INTO stripe_events (id) VALUES (event_id) ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted > 0;
END;
$$;

-- Atomic: company checkout — upsert subscription and update organisation in one transaction.
CREATE OR REPLACE FUNCTION stripe_checkout_company(
  p_organisation_id uuid,
  p_stripe_subscription_id text,
  p_stripe_customer_id text,
  p_plan text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO subscriptions (
    organisation_id,
    stripe_subscription_id,
    stripe_customer_id,
    company_plan,
    status,
    updated_at
  ) VALUES (
    p_organisation_id,
    p_stripe_subscription_id,
    p_stripe_customer_id,
    p_plan::company_plan,
    'active',
    now()
  )
  ON CONFLICT (organisation_id) DO UPDATE SET
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    company_plan = EXCLUDED.company_plan,
    status = EXCLUDED.status,
    updated_at = EXCLUDED.updated_at;

  UPDATE organisations
  SET company_plan = p_plan::company_plan,
      stripe_customer_id = p_stripe_customer_id,
      updated_at = now()
  WHERE id = p_organisation_id;
END;
$$;

-- Atomic: candidate checkout — upsert subscription and upgrade profile to candidate_pro.
CREATE OR REPLACE FUNCTION stripe_checkout_candidate(
  p_user_id uuid,
  p_stripe_subscription_id text,
  p_stripe_customer_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO subscriptions (
    user_id,
    stripe_subscription_id,
    stripe_customer_id,
    candidate_plan,
    status,
    updated_at
  ) VALUES (
    p_user_id,
    p_stripe_subscription_id,
    p_stripe_customer_id,
    'pro',
    'active',
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    candidate_plan = EXCLUDED.candidate_plan,
    status = EXCLUDED.status,
    updated_at = EXCLUDED.updated_at;

  UPDATE profiles
  SET role = 'candidate_pro', updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- Atomic: create organisation (if provided) and profile in one transaction.
-- p_org_name and p_org_type are optional; if both null, only profile is created.
-- Slug is unique; on conflict we append a short suffix so company/agency registration never fails on duplicate name.
CREATE OR REPLACE FUNCTION register_create_org_and_profile(
  p_user_id uuid,
  p_role text,
  p_full_name text,
  p_org_name text DEFAULT NULL,
  p_org_type text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := NULL;
  v_slug text;
  v_approval organisation_approval;
  v_is_org_admin boolean;
BEGIN
  v_is_org_admin := (trim(p_role) = 'leadership');
  IF p_org_name IS NOT NULL AND p_org_type IS NOT NULL THEN
    v_slug := regexp_replace(lower(p_org_name), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    IF v_slug = '' THEN
      v_slug := NULL;
    END IF;
    v_approval := CASE
      WHEN p_org_type = 'agency' THEN 'pending'::organisation_approval
      WHEN p_org_type = 'company' THEN 'approved'::organisation_approval
      ELSE 'approved'::organisation_approval
    END;

    <<insert_org>>
    LOOP
      BEGIN
        INSERT INTO organisations (type, name, slug, approval)
        VALUES (
          p_org_type::organisation_type,
          p_org_name,
          v_slug,
          v_approval
        )
        RETURNING id INTO v_org_id;
        EXIT insert_org;
      EXCEPTION WHEN unique_violation THEN
        -- Slug already exists (e.g. two "Acme" companies); make unique with short suffix from user id
        v_slug := coalesce(v_slug, 'org') || '-' || substr(replace(p_user_id::text, '-', ''), 1, 8);
      END;
    END LOOP insert_org;
  END IF;

  INSERT INTO profiles (id, role, organisation_id, full_name, is_org_admin)
  VALUES (p_user_id, p_role::app_role, v_org_id, p_full_name, v_is_org_admin);

  RETURN v_org_id;
END;
$$;
