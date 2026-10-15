# System Audit Baseline Scorecard (Evidence-Based)

This baseline is scored from direct code review of representative core paths across API routes, services, repositories, frontend role surfaces, and automated tests.

## Audit scores (/100)

| Audit domain                           | Score | Why this score                                                                                                                                     |
| -------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role differentiation and RBAC          |    74 | Strong role checks exist in many routes, but several sensitive paths rely on role checks without strict organisation ownership checks.             |
| Multi-tenancy isolation                |    62 | Tenant tooling exists, but adoption is low (`1` route using tenant-scoped client) and there are high-risk cross-org mutation paths.                |
| Security hardening                     |    67 | Good auth/csrf/rate-limit patterns in multiple domains; weakened by admin-client usage without consistent org scoping on some endpoints.           |
| API route consistency                  |    69 | Shared helpers are present, but route style and guard patterns are inconsistent across the API surface.                                            |
| Backend/service/repository correctness |    71 | Solid structure and reusable libs, but duplicated logic and some cross-cutting concerns are still mixed in handlers.                               |
| Frontend consistency and role UX       |    77 | Role-based navigation and route shell exist, but some access control is soft-gated in UI while backend enforcement quality varies by endpoint.     |
| Maintainability                        |    72 | Useful modularization exists; significant duplication remains in interview/provider resolution and fallback/error behavior is uneven.              |
| Testing maturity and coverage          |    83 | Large suite (`234` test files + `21` e2e specs), but some high-risk tenant-boundary scenarios are not explicitly asserted in affected route tests. |

**Overall baseline:** `72/100`

## Baseline metrics captured

- API route files: `169`
- Routes using auth helper patterns (`getAuthContext/requireAuth/hasRole`): `105`
- Routes using tenant-scoped client (`getTenantScopedClient`): `1`
- Routes using admin client (`createSupabaseAdmin`): `70`
- Test files (`tests/**/*.test.ts(x)`): `234`
- E2E specs (`e2e/*.spec.ts`): `21`

## Highest-priority findings

## P0 - Must fix first

1. Cross-tenant risk in offer mutation routes by ID
   - `src/app/api/offers/[id]/finance/route.ts`
   - `src/app/api/offers/[id]/send/route.ts`
   - `src/app/api/offers/[id]/response/route.ts`
   - Issue: role checks exist, but offer lookup/update paths do not enforce requestor organisation match before mutation.

2. Cross-tenant scoring risk in assessment scoring route
   - `src/app/api/assessments/[id]/score/route.ts`
   - Issue: scorer role check exists, but there is no explicit organisation ownership assertion on the assessment before update.

3. Finance notification blast not organisation-scoped
   - `src/app/api/offers/route.ts`
   - Issue: finance recipients are selected from `employee_roles` without org filter in creation flow.

## P1 - High

4. Tenant isolation implementation is available but underused
   - `src/lib/tenancy/tenant-scoped-client.ts`
   - `src/lib/tenancy/README.md`
   - Issue: strong tenant wrapper exists but very low route adoption creates inconsistent enforcement patterns.

5. Inconsistent error and fallback strategy in template endpoints
   - `src/app/api/assessment-templates/route.ts`
   - `src/app/api/interview-prep/templates/route.ts`
   - Issue: some failures intentionally degrade to success responses with warnings; can mask production failures if not monitored tightly.

## P2 - Medium

6. Repeated provider-resolution logic across interview routes
   - `src/app/api/jobs/[id]/interviews/book/route.ts`
   - `src/app/api/jobs/[id]/interviews/reschedule/route.ts`
   - `src/app/api/jobs/[id]/pipeline/request-interview/route.ts`
   - Issue: repeated blocks increase drift risk and maintenance cost.

7. Client-side route guard is useful but not authoritative
   - `src/components/dashboard/DashboardShell.tsx`
   - Issue: route-role client checks are UX-friendly, but security still depends entirely on backend parity for every API path.

## Evidence anchors reviewed

- API helpers and auth context:
  - `src/lib/api-helpers.ts`
  - `src/lib/settings/server.ts`
  - `src/lib/settings/permissions.ts`
- High-risk domains:
  - `src/app/api/offers/route.ts`
  - `src/app/api/offers/[id]/finance/route.ts`
  - `src/app/api/offers/[id]/send/route.ts`
  - `src/app/api/offers/[id]/response/route.ts`
  - `src/app/api/assessments/route.ts`
  - `src/app/api/assessments/[id]/submit/route.ts`
  - `src/app/api/assessments/[id]/score/route.ts`
  - `src/app/api/scim/v2/Users/route.ts`
  - `src/app/api/scim/v2/Users/[id]/route.ts`
  - `src/app/api/interview-prep/route.ts`
  - `src/app/api/jobs/[id]/interviews/book/route.ts`
  - `src/app/api/jobs/[id]/interviews/reschedule/route.ts`
  - `src/app/api/jobs/[id]/interviews/cancel/route.ts`
  - `src/app/api/jobs/[id]/route.ts`
- Tenancy and entitlement internals:
  - `src/lib/tenancy/tenant-scoped-client.ts`
  - `src/lib/entitlements/index.ts`
  - `src/app/api/entitlements/route.ts`
- Frontend role/navigation surfaces:
  - `src/components/dashboard/Sidebar.tsx`
  - `src/components/dashboard/DashboardShell.tsx`
  - `src/components/settings/SettingsModule.tsx`
  - `src/components/settings/SettingsSidebar.tsx`
  - `src/app/(dashboard)/company/finance/page.tsx`
- Test coverage samples:
  - `tests/unit/offers-routes.test.ts`
  - `tests/unit/assessments-routes.test.ts`
  - `tests/security/role-escalation.test.ts`
  - `tests/integration/multi-tenant-isolation.test.ts`
  - `tests/unit/scim-users-route.test.ts`

## Target score to claim "best-in-class"

- Required minimum per domain: `>=90`
- Required overall: `>=92`
- Required open severity: no P0/P1 remaining

## Remediation sequence for score lift

1. Fix P0 org-ownership assertions in offer and assessment mutation routes.
2. Add explicit tenant-boundary tests for those exact routes.
3. Refactor interview-provider resolution into one shared utility.
4. Expand tenant-scoped client adoption domain by domain.
5. Standardize route error/validation guard template and enforce in PR checklist.
