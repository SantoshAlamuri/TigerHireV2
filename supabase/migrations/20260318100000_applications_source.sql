-- Add source to applications for tracking where the application came from (e.g. direct, apply_page, referral).
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS source VARCHAR(64) NOT NULL DEFAULT 'direct';

COMMENT ON COLUMN applications.source IS 'Application source: direct (logged-in apply), apply_page (public form), or other campaign/referral tag.';
