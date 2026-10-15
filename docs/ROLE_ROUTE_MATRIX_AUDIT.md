# Role and Route Matrix Audit

Use this document to verify role differentiation is enforced in backend route handlers, not only in frontend navigation.

## Roles in scope

- `admin`
- `company_admin` / `hiring_manager`
- `recruiter`
- `interviewer`
- `candidate`
- `employee`
- `agency_recruiter` (if enabled paths exist)

## Verification rules

- Every sensitive route must explicitly allow known roles and deny all others.
- Frontend visibility must match backend authorization behavior.
- Capability flags must not override hard role restrictions unless explicitly designed.

## Critical route domains to validate

- `src/app/api/admin/**`
- `src/app/api/settings/**`
- `src/app/api/offers/**`
- `src/app/api/assessments/**`
- `src/app/api/interview-prep/**`
- `src/app/api/jobs/**/interviews/**`
- `src/app/api/scim/**`
- `src/app/api/entitlements/route.ts`

## Matrix checklist (must pass)

| Domain                         | Allowed roles                                 | Explicitly denied roles                              | Evidence required                |
| ------------------------------ | --------------------------------------------- | ---------------------------------------------------- | -------------------------------- |
| Admin platform routes          | admin                                         | all non-admin roles                                  | 403 tests + e2e nav denial       |
| Org settings and privacy       | company_admin, recruiter (where intended)     | candidate, employee, interviewer                     | route tests + UI redirect checks |
| Personal settings integrations | recruiter, hiring_manager (own profile scope) | admin for user-only scopes if policy says user-owned | ownership tests                  |
| Offers finance decision        | finance-authorized roles only                 | recruiter without finance permission, candidate      | state transition + 403 tests     |
| Assessments create/manage      | enterprise hiring roles with capability       | candidate/interviewer (except scoring if intended)   | create/score tests               |
| Interview prep template mutate | roles with manage permission                  | interviewer read-only if policy read-only            | GET vs POST/PATCH/DELETE tests   |
| Interview scheduling mutate    | recruiter/hiring manager                      | candidate/interviewer if not permitted               | booking/reschedule 403 tests     |
| SCIM endpoints                 | SCIM bearer + authorized org context          | non-bearer or wrong org                              | 401/403 + tenant-header tests    |

## Route-level checks for each audited endpoint

For each route handler:

- Confirm auth context required for non-public endpoint.
- Confirm role and capability checks are explicit and readable.
- Confirm tenant/org ownership checks exist before read/write.
- Confirm denied cases return expected status (`401`, `403`, `404` policy as designed).
- Confirm tests include both allowed and denied role scenarios.

## Frontend/Backend parity checks

For each dashboard section in `src/app/(dashboard)`:

- UI link exists only for intended roles.
- Direct URL access by unauthorized role is blocked server-side.
- API calls behind the page enforce same role policy.

## Required test artifacts

- Route unit/functional tests for allowed + denied role combinations.
- Playwright role-switch scenarios for protected pages.
- Negative-path assertions for privilege escalation attempts.

## Common failure patterns to flag immediately

- UI hides button, but API still allows action.
- Capability check exists without base role check.
- Route trusts client-supplied `organisation_id`.
- Read paths scoped, but write paths unscoped.
- Inconsistent status codes for same denial reason across similar routes.
