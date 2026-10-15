# Architecture: Security, Performance, Scalability & Seed

## Multi-tenant model

- **Tenant = organisation** (`profiles.organisation_id`). Agency tenants also have client orgs via `agency_clients`.
- **Auth context**: `getAuthContext()` provides `userId`, `role`, `organisationId` (cached in Redis).
- **Defence in depth**: API checks (e.g. `assertCandidateAccessForOrgs`) plus RLS and storage policies.

## Security (industry-standard)

- **Candidate list**: Only candidates the org can access (unlock or fit_score for that org’s jobs). Agency: own org + client orgs.
- **Candidate detail & resumes**: Same rule; 403 if no access. Resume and CV storage: read allowed only when path segment (candidate_id/user_id) passes `can_caller_orgs_access_candidate_resume()` (unlock or fit_score for caller’s org(s)).
- **Applications**: RLS restricts by job’s org; agency can read/update for client jobs; hiring managers can update for assigned jobs.
- **DB helpers**: `auth_organisation_ids()`, `can_org_access_candidate()`, `can_caller_orgs_access_candidate()`, `can_caller_orgs_access_candidate_resume(path_segment)` (migration 74).

## Performance & scalability

- **Accessible candidate IDs**: For small org lists, app uses two client queries (unlocks + fit_scores via jobs). For **org list ≥ 50**, app calls RPC `get_accessible_candidate_ids(p_organisation_ids)` (single round-trip, server-side UNION). If RPC is not yet deployed, falls back to client queries.
- **Cap**: Up to 5000 candidate IDs applied to list filter to avoid huge `IN` clauses.
- **RLS**: Policies use `auth_organisation_id()` / `auth_organisation_ids()` and indexed columns (e.g. `organisation_id`, `job_id`, `candidate_id`).

## Seed

- **Finstack seed** (`POST /api/seed/finstack`): Only in non-production or when `X-Seed-Demo-Secret` matches `SEED_DEMO_SECRET`. Idempotent: skips if Finstack already has `[Seed]` jobs. All data is scoped to the Finstack organisation (jobs, applications, fit_scores, pipeline). Run after `POST /api/auth/seed-demo-users`.
- **Demo users**: Separate route; creates auth users and profiles with roles and org assignment.

## Applying migration 74

Run `supabase/schema/74_tenant_security_storage_apps.sql` in the Supabase SQL Editor (after 73 and storage schemas). This adds:

- `auth_organisation_ids()`, `can_org_access_candidate()`, `can_caller_orgs_access_candidate()`, `can_caller_orgs_access_candidate_resume()`
- Application RLS for agency and hiring managers
- Tenant-scoped storage policies and `get_accessible_candidate_ids` RPC

Without migration 74, the app still works; storage remains per-role (broader read) and candidate list uses client queries only (no RPC fallback).
