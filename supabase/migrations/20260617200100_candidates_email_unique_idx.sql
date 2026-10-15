-- P0: Public apply duplicate-candidate race.
-- saveCandidate uses SELECT-then-INSERT for find-or-create on candidates.email,
-- which races on concurrent double-clicks / mobile-retry / slow connections.
-- createCandidate ALREADY handles 23505 (unique violation) and falls back to
-- findExistingCandidate — but that handler is dead code today because there
-- was no unique constraint to trigger 23505. Adding the partial unique here
-- activates the existing fallback path.
--
-- Partial index excludes NULL/empty emails so candidates created via WhatsApp
-- referral (phone-only, no email yet) remain unaffected. Case-insensitive
-- because email comparisons in the dedup helpers use normalizeEmailForCandidate
-- which lowercases.

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_email_unique_ci
  ON public.candidates (LOWER(email))
  WHERE email IS NOT NULL AND email <> '';

COMMENT ON INDEX public.idx_candidates_email_unique_ci IS
  'Case-insensitive unique on non-empty email. Activates the 23505 fallback in lib/agents/public-apply.ts createCandidate so concurrent applies for the same email collapse to one candidate row.';
