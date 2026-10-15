# TigerHire Supabase schema

Table definitions for the TigerHire database. **Run in order** when creating the DB (you can turn these into migrations later).

**Full reference:** See [../TABLES_AND_VIEWS.md](../TABLES_AND_VIEWS.md) for all tables, views, storage buckets, and enums. App code can use `src/types/supabase-tables.ts` for table/view/bucket name constants.

## Run order

1. `00_extensions_and_enums.sql` — pgvector, uuid, enums (role, org type, job status, etc.)
2. `01_organisations.sql` — companies and agencies
3. `02_profiles.sql` — user profiles (extends `auth.users`, role + org)
4. `03_waitlist_and_contact.sql` — waitlist signups, contact form
5. `04_signals.sql` — raw candidate signals (Talent Scout)
6. `05_candidates.sql` — enriched candidates + FK from signals
7. `06_jobs.sql` — job descriptions
8. `07_fit_scores.sql` — FitScore per job–candidate
9. `08_invites_unlocks_agent_logs.sql` — invites, unlocks, agent logs
10. `09_subscriptions.sql` — Stripe company/candidate plans
11. `10_rls_policies.sql` — row level security
12. `11_functions.sql` — DB functions
13. `12_storage.sql` — storage buckets (resumes, verification-videos)
14. `13_verifications.sql` — VerifyKit verification flow
15. `14_delivery_feedback.sql` — DeliverFlow hire/reject feedback for FitScore retraining
    … (later schema files)
16. `72_agency_clients.sql` — agency ↔ client org links
17. `73_agency_clients_rls.sql` — RLS for agency_clients
18. `74_tenant_security_storage_apps.sql` — tenant-scoped storage (resumes, videos, candidate-cvs), agency applications & hiring manager RLS, `auth_organisation_ids()` / `can_org_access_candidate()` helpers, `get_accessible_candidate_ids` RPC
19. `75_agency_clients_is_active.sql` — `agency_clients.is_active` soft-disable flag and UPDATE policies for agency + super_admin

**One-shot for agency feature:** Run `../run_agency_clients_migration.sql` in Supabase SQL Editor to create the table and apply RLS in one go (idempotent).

## Dependencies

- **Supabase Auth**: `profiles.id` → `auth.users(id)`; `candidates.user_id` and `jobs.created_by` reference `auth.users`.
- **pgvector**: `candidates.profile_embedding`, `jobs.jd_embedding` (e.g. 1536 dimensions for OpenAI). Create the tables first; you can add the vector columns later if the extension is not enabled yet.

## Row Level Security (RLS)

RLS policies are **not** included here. Add them in your migrations (e.g. per-role access to organisations, jobs, candidates, fit_scores).

## Quick apply (Supabase SQL Editor)

Paste and run each file in order, or concatenate:

```bash
# Example (run from repo root)
for f in supabase/schema/*.sql; do
  echo "Running $f"
  # Use Supabase CLI or paste contents into SQL Editor
done
```
