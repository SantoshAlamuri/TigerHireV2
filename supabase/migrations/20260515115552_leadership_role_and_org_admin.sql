-- Brief 1 PR-A: rename app_role company_admin → leadership; add profiles.is_org_admin.
-- Requires PostgreSQL 10+ for ALTER TYPE ... RENAME VALUE.

-- up
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_org_admin boolean NOT NULL DEFAULT false;

ALTER TYPE public.app_role RENAME VALUE 'company_admin' TO 'leadership';

UPDATE public.profiles
SET is_org_admin = true
WHERE role = 'leadership'::public.app_role;

COMMENT ON COLUMN public.profiles.is_org_admin IS 'Org product setup (gear); orthogonal to role bundle.';

-- down
ALTER TYPE public.app_role RENAME VALUE 'leadership' TO 'company_admin';

ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_org_admin;
