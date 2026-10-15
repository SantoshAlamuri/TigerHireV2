-- Seed company plan limits so platform admin can change them in DB without code deploy.
-- App uses env for stripe_price_id when this column is empty; limits are read from here.
-- ON CONFLICT: update limits/name so existing rows get defaults, but do not overwrite stripe_price_id.
INSERT INTO billing_plans (plan_key, plan_type, stripe_price_id, name, limits, updated_at)
VALUES
  ('starter', 'company', '', 'Starter', '{"unlocks": 15}', now()),
  ('growth', 'company', '', 'Growth', '{"unlocks": 50}', now()),
  ('scale', 'company', '', 'Scale', '{"unlocks": -1}', now()),
  ('free', 'company', '', 'Free', '{"unlocks": 5}', now())
ON CONFLICT (plan_key, plan_type) DO NOTHING;
