# No-Excuse 100/100 TODO Tracker

Purpose: define the non-negotiable checklist to reach and hold `100/100` quality in core engineering audits.

Rule: a domain is **not** 100 until every checkbox in that domain is complete and verified by tests/evidence.

---

## 1) API Routes - Target 100/100

### Must-have controls on every protected route

- [ ] Uses auth guard (`getAuthContext` + `requireAuth`) with correct `401` behavior.
- [ ] Uses explicit role and capability checks with correct `403` behavior.
- [ ] Uses strict input validation (Zod or equivalent) for every mutating handler.
- [ ] Enforces tenant/org ownership on read and mutation paths.
- [ ] Returns standardized error envelopes and status codes.
- [ ] Uses CSRF/origin validation where browser-initiated mutation exists.
- [ ] Uses rate limiting where abuse-sensitive.
- [ ] Uses structured error logging context (`route`, `userId`, request/correlation id).

### Definition of 100

- [ ] 100% protected routes satisfy all controls above.
- [ ] 0 routes with missing org ownership checks.
- [ ] 0 routes with inconsistent status behavior for same failure class.

---

## 2) Database and Data Isolation - Target 100/100

### Must-have controls

- [ ] RLS/policies enforce tenant boundaries for all tenant tables.
- [ ] No cross-tenant read/write path is reproducible via direct API calls.
- [ ] All mutation queries include deterministic tenant scope.
- [ ] All high-risk state transitions are transaction-safe or atomically guarded.
- [ ] Foreign key and unique constraints protect domain invariants.
- [ ] Soft-delete/archive behavior is consistent and non-leaky.
- [ ] Migration history is reproducible and rollback strategy documented.

### Definition of 100

- [ ] 0 cross-tenant leakage defects (manual + automated validation).
- [ ] 0 critical data-integrity violations under concurrent test scenarios.

---

## 3) Security - Target 100/100

### Must-have controls

- [ ] AuthN/AuthZ correctness for every sensitive endpoint.
- [ ] Secrets are never returned in responses or logs.
- [ ] Webhooks use strict signature/token validation.
- [ ] Cron endpoints require strong auth and least privilege.
- [ ] CSRF protections in place for browser mutation routes.
- [ ] Input sanitization and output encoding are validated.
- [ ] Audit logging exists for security-sensitive actions.
- [ ] No hardcoded credentials/tokens in codebase.

### Definition of 100

- [ ] 0 open P0/P1 security findings.
- [ ] Security suites pass with no skipped high-risk tests.

---

## 4) Roles and Permission Differentiation - Target 100/100

### Must-have controls

- [ ] Canonical role-permission matrix exists and is current.
- [ ] UI visibility and backend authorization are in parity.
- [ ] Capability toggles cannot bypass base role restrictions.
- [ ] Privilege escalation attempts are denied and tested.
- [ ] All admin/super-admin paths are strictly isolated.

### Definition of 100

- [ ] 0 role drift mismatches between UI and API.
- [ ] 100% critical role transitions covered by tests.

---

## 5) Multi-Tenancy - Target 100/100

### Must-have controls

- [ ] Tenant-scoped access strategy is applied consistently.
- [ ] Every ID-based mutation confirms org ownership before update/delete.
- [ ] Cache keys are tenant-safe (org/user scoped where needed).
- [ ] Async jobs/webhooks/cron execute with explicit tenant context.
- [ ] Agency/client and super-admin exceptions are explicit and tested.

### Definition of 100

- [ ] 0 unscoped high-risk routes.
- [ ] 0 cross-tenant cache contamination scenarios.

---

## 6) Service and Repository Layers - Target 100/100

### Must-have controls

- [ ] Route handlers orchestrate only; business rules sit in service layer.
- [ ] Repository functions are single-responsibility and tenant-safe.
- [ ] No duplicated critical business logic across route files.
- [ ] Idempotency and retry behavior defined for side-effect operations.
- [ ] Error mapping is consistent from repository -> service -> API.

### Definition of 100

- [ ] 0 duplicated critical logic blocks left unrefactored.
- [ ] 100% critical service methods covered by unit tests.

---

## 7) Frontend Consistency - Target 100/100

### Must-have controls

- [ ] Role-based navigation is aligned with backend permissions.
- [ ] All pages have deterministic loading/error/empty states.
- [ ] Forms provide consistent client+server validation UX.
- [ ] Mutations prevent duplicate submits and expose clear outcomes.
- [ ] Feature-gated UI cannot invoke forbidden backend operations.

### Definition of 100

- [ ] 0 broken role navigation or protected-route UX mismatches.
- [ ] 0 critical flows with undefined failure UX.

---

## 8) Testing and CI - Target 100/100

### Must-have controls

- [ ] Every mutating API route has success + validation + unauthorized tests.
- [ ] Every critical journey has at least one E2E happy path.
- [ ] Every critical journey has at least one negative-path test.
- [ ] Security and tenancy suites run in CI and are required for merge.
- [ ] Flaky tests are tracked with owner and expiry.
- [ ] No skipped critical tests without linked issue and due date.

### Definition of 100

- [ ] 0 critical path uncovered.
- [ ] Stable CI with no unresolved flaky critical tests.

---

## 9) Observability and Maintainability - Target 100/100

### Must-have controls

- [ ] Structured logging with correlation IDs on critical routes.
- [ ] Error monitoring and alert routing for key failure classes.
- [ ] Audit logs for sensitive mutations.
- [ ] Critical modules have current docs and runbooks.
- [ ] Complexity and duplication hotspots have owners and remediation plans.

### Definition of 100

- [ ] 0 blind spots in critical flow observability.
- [ ] 0 undocumented critical operational procedures.

---

## 10) Certification Gate (Cannot claim 100/100 without all)

- [ ] No open P0/P1 issues.
- [ ] All domain definitions of 100 satisfied.
- [ ] Full regression suite green.
- [ ] Security + tenancy sign-off completed.
- [ ] Audit evidence bundle published.

---

## Execution board (fill during remediation)

| Domain                        | Owner | Current score | Target | Blockers | ETA | Status |
| ----------------------------- | ----- | ------------: | -----: | -------- | --- | ------ |
| API routes                    |       |               |    100 |          |     | Todo   |
| Database                      |       |               |    100 |          |     | Todo   |
| Security                      |       |               |    100 |          |     | Todo   |
| Roles/RBAC                    |       |               |    100 |          |     | Todo   |
| Multi-tenancy                 |       |               |    100 |          |     | Todo   |
| Services/repos                |       |               |    100 |          |     | Todo   |
| Frontend consistency          |       |               |    100 |          |     | Todo   |
| Testing/CI                    |       |               |    100 |          |     | Todo   |
| Observability/maintainability |       |               |    100 |          |     | Todo   |
