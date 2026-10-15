-- Prescreen gate: record explicit consent declines.
--
-- A candidate who replies NO at the consent step gets their session closed
-- (state = 'complete', zero responses) — exactly the same shape a lifecycle
-- timeout leaves behind. That ambiguity made the post-shortlist re-nudge
-- re-invite explicit decliners. `declined_at` disambiguates: set only by the
-- inbound consent-decline branch, and re-engagement paths (renudge) must
-- exclude sessions where it is non-null.
ALTER TABLE public.prescreen_sessions
  ADD COLUMN IF NOT EXISTS declined_at timestamptz;

COMMENT ON COLUMN public.prescreen_sessions.declined_at IS
  'Set when the candidate explicitly replied NO at the consent step. Distinguishes an explicit opt-out from a timeout (both end state=complete with no responses); re-nudge paths must skip sessions with declined_at set.';
