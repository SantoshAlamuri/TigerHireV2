-- Referral/apply claim tokens (Workstream B2.2)
--
-- A candidate created via the public apply flow is initially "unclaimed"
-- (candidates.user_id is null). The email-based auto-claim only links them if
-- they later sign up with the same email. This adds a one-time, expiring claim
-- token so the apply link can carry a deterministic "claim your profile" path
-- that works regardless of which email they sign up with.
--
-- The token is single-use (cleared on claim) and time-boxed. It only ever
-- allows binding an *unclaimed* candidate to the authenticated user.

alter table public.candidates
  add column if not exists claim_token text,
  add column if not exists claim_token_expires_at timestamptz;

-- One candidate per live token.
create unique index if not exists candidates_claim_token_key
  on public.candidates (claim_token)
  where claim_token is not null;

comment on column public.candidates.claim_token is
  'One-time token (B2.2) to claim an unclaimed candidate profile from an apply link; cleared on claim.';
comment on column public.candidates.claim_token_expires_at is
  'Expiry for claim_token; expired tokens are ignored by the claim endpoint.';
