-- TigerHire schema — run in order. Migrations can be generated from these files later.
-- Requires: Supabase project (auth.users exists). Run 00 → 01 → 02 → … in sequence.

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Role (stored in profiles; used for routing and RLS)
CREATE TYPE app_role AS ENUM (
  'super_admin',
  'leadership',
  'recruiter',
  'hiring_manager',
  'agency',
  'employee',
  'candidate_pro',
  'candidate_free'
);

-- Organisation type
CREATE TYPE organisation_type AS ENUM ('company', 'agency');

-- Organisation approval (agencies require manual approval)
CREATE TYPE organisation_approval AS ENUM ('pending', 'approved', 'rejected');

-- Job status
CREATE TYPE job_status AS ENUM ('draft', 'open', 'closed');

-- Signal source (Talent Scout)
CREATE TYPE signal_source AS ENUM ('naukri', 'indeed', 'linkedin', 'manual', 'other');

-- Signal pipeline status (SignalHunt contract)
CREATE TYPE signal_status AS ENUM ('raw', 'enriched', 'verified', 'rejected');

-- Subscription/plan identifiers (align with Stripe product names)
CREATE TYPE company_plan AS ENUM ('starter', 'growth', 'scale');
CREATE TYPE candidate_plan AS ENUM ('free', 'pro');

-- VerifyKit: verification badge level (Bronze = WhatsApp only; Silver = + video; Gold = + employer ping)
CREATE TYPE verification_badge AS ENUM ('bronze', 'silver', 'gold');
