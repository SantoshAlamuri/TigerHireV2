# Candidate Profile Upgrade

TigerHire remains independent of Caddie. This change adds a richer candidate-owned
profile without sharing candidate data or changing authentication between products.

## Scope

- Personal, Career, Preferences, Documents, and Account tabs.
- Structured summary, dated work history, education, achievements, certifications,
  and self-assessed skill evidence. These are candidate-entered claims, not verified scores.
- Skill editing for free and paid candidates; blank optional links can be saved.
- Preferences share the existing standalone preferences form. Clearing a selection
  or salary bound clears the stored value. Work-mode updates preserve other preferences.
- Unsaved form state survives profile-tab changes. Career saves reject stale revisions.
- Existing resume upload/version management and recruiter-facing profile fields remain.

## Storage and Privacy

`candidate_career_profiles` stores one JSON document per candidate. Session-owned
API lookups and row-level security restrict candidate access to their own row.
Only the database trigger controls the revision timestamp. Client-provided owner
IDs and verification fields are rejected by the API.

Career details are private drafts: this release does not publish them to recruiters,
send them to Caddie, include them in job matching, or extract them automatically
from a CV. Data export includes the document; account erasure deletes it.

## Release Order

1. Review and apply `20260904161828_candidate_career_profiles.sql` to the intended
   Supabase environment using the normal migration process.
2. Deploy the application changes only after the migration succeeds. Career
   saving, export, and erasure depend on the new table; do not deploy code first.
3. Verify two candidate accounts cannot access each other's career records, then
   smoke-test edit/save/reload, clearing preferences, export, and erasure on test accounts.

The migration has been tested with local PostgreSQL-compatible PGlite, including
owner isolation, anonymous denial, stale writes, timestamp updates, and cascade
deletion. It has not been applied to a hosted Supabase project. Browser verification
uses fixture-backed profile APIs; no real candidate profiles are modified.
