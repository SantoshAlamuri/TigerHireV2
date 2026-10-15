-- RLS + storage tenant isolation hardening
-- ---------------------------------------------------------------------------
-- Closes three verified cross-tenant data exposures:
--
--   a) The `resumes` storage bucket had two PERMISSIVE storage.objects policies
--      ("Users can read own resumes" / "Users can update own resumes") whose
--      USING was just `(bucket_id = 'resumes')`. Because storage.objects policies
--      are OR-combined, those wide-open policies let ANY authenticated user read
--      and update EVERY resume object regardless of ownership/org. We drop them;
--      the remaining per-uid and org-scoped resumes policies still cover all
--      legitimate access (a user's own uploads + org members via unlock/fit_score).
--
--   b) `public.candidates` RLS policy `candidates_select` was too broad: it let
--      any recruiter / leadership / agency user read all visibility=true
--      candidates cross-org. We replace it with an UNLOCK-GATED policy that only
--      exposes a candidate to: the candidate themselves, platform super_admin,
--      or orgs that have actually unlocked / fit-scored that candidate
--      (via public.can_caller_orgs_access_candidate).
--
-- The candidate-cvs PUBLIC-bucket flip lives in a SEPARATE migration
-- (20260616130100_candidate_cvs_private.sql) because it is coupled to the app's
-- signed-URL change and must be promoted WITH that code. Parts (a) and (b) here
-- only REMOVE over-broad access and are safe to apply independently/immediately.
-- This file is idempotent and safe to re-run.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- (a) Drop over-broad resumes storage.objects policies
-- ---------------------------------------------------------------------------
drop policy if exists "Users can read own resumes" on storage.objects;
drop policy if exists "Users can update own resumes" on storage.objects;

-- ---------------------------------------------------------------------------
-- (b) Tighten public.candidates SELECT to unlock-gated org access
-- ---------------------------------------------------------------------------
drop policy if exists "candidates_select" on public.candidates;
create policy "candidates_select"
  on public.candidates
  as permissive
  for select
  to authenticated
  using (
    (user_id = (select auth.uid()))
    or (auth_role() = 'super_admin')
    or public.can_caller_orgs_access_candidate(id)
  );

-- (candidate-cvs bucket flip moved to 20260616130100_candidate_cvs_private.sql)
