# Multi-Tenant Security Audit

**Date:** 2025-02-25  
**Scope:** Strict enforcement of multi-tenancy and data visibility per organisation (tenant).

## Summary

The app uses **organisation-based multi-tenancy** (`organisation_id` from `profiles` and related tables). Auth context is provided by `getAuthContext()` (`userId`, `role`, `organisationId`). Many API routes and RLS policies correctly scope data by organisation. **Several gaps** allow cross-tenant visibility and should be tightened for strict enforcement.

---

## What Is Enforced Well

### 1. Auth and context

- **`src/lib/api-helpers.ts`**: `getAuthContext()` loads `role` and `organisation_id` from profiles (with Redis cache). Used consistently for `requireAuth()` and `hasRole()`.
- **Role checks**: Routes gate access by role (e.g. only recruiters/company_admin/agency for candidate list, only org members for jobs).

### 2. Jobs

- **List**: `GET /api/jobs` filters by `organisationId` or agency client `organisationIds` and passes them to `JobRepository.list()`.
- **Single**: `GET/PATCH/DELETE /api/jobs/[id]` enforce `job.organisation_id === ctx.organisationId` (and agency client checks where relevant).
- **RLS**: `rls_migration.sql` – "Org members can read all their org jobs", "Org hiring roles can create/update own org jobs", etc.

### 3. Applications

- **List**: `GET /api/applications` uses `createSupabaseServerClient()`; RLS "Org members can read applications for their jobs" limits rows to jobs where `jobs.organisation_id = auth_organisation_id()`.
- **Single**: `GET /api/applications/[id]` uses same client; RLS prevents reading other orgs’ applications.
- **Update**: RLS "Org hiring roles can update applications for their jobs" restricts updates to own org.

### 4. Fit scores

- **`GET /api/fit-score/[id]`**: Explicit check `job?.organisation_id !== ctx.organisationId` → 403.
- **RLS**: "Org members can read scores for their jobs" (via `jobs.organisation_id = auth_organisation_id()`).

### 5. Candidate resume access

- **`src/lib/security/candidate-resume-access.ts`**: `assertCanAccessCandidateResumes()` enforces:
  - Candidates: only own resumes (`candidate.user_id === ctx.userId`).
  - Recruiters/company_admin/agency/hiring_manager: must have access via `assertCandidateAccess()` (unlock or fit_score for their org).
  - super_admin: full access.
- **Resume routes** (`/api/candidates/[id]/resumes`, `.../resumes/[versionId]`) call this before any read/update/delete.

### 6. Candidate unlock and PII

- **`GET /api/candidates/[id]`**: For recruiters, full PII only if there is a `candidate_unlocks` row for `(candidate_id, ctx.organisationId)`; otherwise name/email/phone are masked.
- **Unlock route**: Requires `ctx.organisationId` and job ownership; creates unlock for that org.

### 7. Other org-scoped routes

- Hiring requests, messages, pipeline, shortlist, interviews, billing, invites, etc. use `ctx.organisationId` or job ownership checks and RLS where applicable.

### 8. Tenancy helpers

- **`src/lib/security/tenancy.ts`**: `assertJobOwnership(jobId, companyId)`, `assertCandidateAccess(candidateId, companyId)` (unlock or fit_score), `assertFitScoreAccess(fitscoreId, companyId)` used where needed.

---

## Gaps and Recommendations

### 1. **Candidate list is not tenant-scoped (high)**

- **Where**: `GET /api/candidates` → `CandidateService.listMasked()` → `CandidateRepository.list()`.
- **Issue**: Repository filters only by `visibility = true` and search/filters. It does **not** filter by organisation. So any recruiter/company_admin/agency can list **all visible candidates** across all organisations.
- **RLS**: Policy "Recruiters can read visible candidates" allows any recruiter to SELECT any visible candidate row; there is no `organisation_id` condition on `candidates` (candidates are global; access is via unlocks/fit_scores).
- **Recommendation**:
  - **Application layer**: For non–super_admin recruiter roles, restrict the candidate list to candidates the org is allowed to see: e.g. those with at least one `candidate_unlocks` for `ctx.organisationId` or at least one `fit_scores` for a job with `jobs.organisation_id` in the org (and agency client orgs). Pass `organisationId` / `organisationIds` into the list API and repository and apply this filter (e.g. via subquery or join).
  - **Optional (defence in depth)**: Add an RLS policy so recruiter SELECT on `candidates` is limited to rows that are linked to their org via unlocks or fit_scores (e.g. using a SECURITY DEFINER helper). This is more complex but strengthens isolation at the DB layer.

### 2. **Candidate detail view exposes existence (medium)**

- **Where**: `GET /api/candidates/[id]`.
- **Issue**: Recruiters can call this for any candidate id. RLS allows "Recruiters can read visible candidates", so they get the row. PII is masked if not unlocked, but **they learn that the candidate exists** and see non-PII (e.g. skills, location). For strict tenant isolation, recruiters should only see candidates their org has unlocked or has a fit_score for.
- **Recommendation**: Before returning the candidate, for recruiter/company_admin/agency (when not super_admin), call the same access logic as resume access (e.g. `assertCandidateAccess(candidateId, ctx.organisationId)`) and return 403 if the org has no access. Then data visibility is aligned with “only candidates we have a relationship with”.

### 3. **Storage: company users can read all resume/video objects (medium)** — **Fixed**

- **Where**: `supabase/schema/12_storage.sql`, `21_storage_candidate_cvs.sql`.
- **Issue**: Policies allowed any company role to read all objects in buckets.
- **Fix**: Migration `74_tenant_security_storage_apps.sql` adds `can_org_access_candidate()`, `can_caller_orgs_access_candidate()`, and `can_caller_orgs_access_candidate_resume(path_segment)`. Storage policies now allow company read only when the object path’s first segment (candidate_id or user_id) is a candidate the caller’s org(s) can access (unlock or fit_score). Agency uses `auth_organisation_ids()` (own + client orgs). Policy "Candidates can read own resume by candidate id path" added for upload-resume path convention (`candidate_id/filename`).

### 4. **Agency and client organisations** — **Fixed**

- **Applications RLS**: Previously only `jobs.organisation_id = auth_organisation_id()`, so agency could not see client jobs’ applications.
- **Fix**: Migration 74 extends "Org members can read applications for their jobs" and "Org hiring roles can update applications for their jobs" to allow agency when `job.organisation_id` is in `agency_clients.client_organisation_id` for the agency’s org. Same logic used in storage and app layer via `auth_organisation_ids()`.

### 5. **Hiring manager in application updates** — **Fixed**

- **Fix**: Migration 74 adds policy "Hiring managers can update applications for assigned jobs" (UPDATE allowed when `auth_role() = 'hiring_manager'` and `jobs.hiring_manager_id = auth.uid()`). Org hiring roles policy unchanged; both can allow the update.

---

## Checklist for strict multi-tenant enforcement

| Area              | Status | Notes                                                                            |
| ----------------- | ------ | -------------------------------------------------------------------------------- |
| Auth context      | OK     | role + organisationId from profile, cached                                       |
| Jobs CRUD         | OK     | Filtered by org / agency clients; RLS in place                                   |
| Applications      | OK     | RLS restricts by job org                                                         |
| Fit scores        | OK     | Route and RLS restrict by job org                                                |
| Candidate list    | Fixed  | Scoped by org (and agency client orgs); only candidates with unlock or fit_score |
| Candidate detail  | Fixed  | assertCandidateAccessForOrgs; 403 if org has no unlock/fit_score access          |
| Candidate resumes | OK     | assertCanAccessCandidateResumes enforces org access                              |
| Candidate unlock  | OK     | Org-scoped; job ownership checked                                                |
| Storage (resumes) | Fixed  | Tenant-scoped via can_caller_orgs_access_candidate_resume (migration 74)         |
| Pipeline / jobs   | OK     | Org and HM checks in routes and RLS                                              |
| Billing / invites | OK     | Org-scoped                                                                       |

---

## Implemented (industry-standard)

1. **Candidate list scoping**: `GET /api/candidates` and `CandidateRepository.list()` filter by org (and agency client orgs); only candidates with unlock or fit_score for caller’s org(s).
2. **Candidate detail access**: `GET /api/candidates/[id]` uses `assertCandidateAccessForOrgs`; 403 when org has no access.
3. **Storage policies**: Migration 74 — tenant-scoped read for resumes, verification-videos, candidate-cvs via `can_caller_orgs_access_candidate_resume(path_segment)`.
4. **Agency applications**: RLS extended so agency can read/update applications for client jobs.
5. **Hiring manager**: RLS policy added so hiring managers can update applications for their assigned jobs.
6. **Performance/scalability**: RPC `get_accessible_candidate_ids(p_organisation_ids)`; app uses it when org list ≥ 50 (with fallback if RPC not yet deployed).
7. **Automatic tenant isolation system** (2026-03-19): New `TenantScopedClient` in `src/lib/tenancy/` provides automatic tenant filtering for all database queries. Use `getTenantScopedClient(ctx)` in API routes to ensure tenant isolation without manual checks. See `src/lib/tenancy/README.md` for usage. This makes it impossible to forget tenant checks - all queries are automatically scoped.
