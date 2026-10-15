-- Add LinkedIn, portfolio, and GitHub URL columns to candidates.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS portfolio_url text,
  ADD COLUMN IF NOT EXISTS github_url text;
