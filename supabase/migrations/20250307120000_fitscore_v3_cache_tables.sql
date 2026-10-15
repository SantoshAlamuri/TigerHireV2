-- FitScore v3 pipeline cache tables (Stage 1 & Stage 2 outputs).
-- Applied via user-supabase MCP; this file keeps the repo in sync with the DB.
-- Safe to run: uses IF NOT EXISTS so already-applied migrations no-op.

-- Stage 1: JD Intel — one row per job. Cached structured JD profile (role_type, must_have_skills, evidence_signals, weights).
CREATE TABLE IF NOT EXISTS jd_intel_cache (
  job_id uuid NOT NULL PRIMARY KEY REFERENCES jobs (id) ON DELETE CASCADE,
  profile jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE jd_intel_cache IS 'FitScore v3 Stage 1: cached JD Intel output per job. profile = structured JD (role_type, must_have_skills with evidence_signals, weights).';
COMMENT ON COLUMN jd_intel_cache.profile IS 'Structured JD profile from Stage 1 (JD Intel): role_title, role_type, seniority, must_have_skills[], weights, etc.';

-- Stage 2: Resume Extract — one row per candidate. Cached structured candidate profile (skills_with_evidence, design_systems, etc.).
CREATE TABLE IF NOT EXISTS candidate_profile_cache (
  candidate_id uuid NOT NULL PRIMARY KEY REFERENCES candidates (id) ON DELETE CASCADE,
  profile jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE candidate_profile_cache IS 'FitScore v3 Stage 2: cached Resume Extract output per candidate. profile = structured candidate (skills_with_evidence, design_systems, etc.).';
COMMENT ON COLUMN candidate_profile_cache.profile IS 'Structured candidate profile from Stage 2 (Resume Extract): skills_with_evidence, design_systems[], quantified_outcomes, etc.';

-- Indexes for lookups (optional; PK already gives unique lookup per job/candidate)
CREATE INDEX IF NOT EXISTS idx_jd_intel_cache_updated_at ON jd_intel_cache (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidate_profile_cache_updated_at ON candidate_profile_cache (updated_at DESC);
