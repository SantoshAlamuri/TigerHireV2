# System Audit Execution Pack

This is the execution playbook for a complete TigerHire system audit focused on:

- consistency
- bad code / bad logic
- unfinished business
- role clarity
- multi-tenancy isolation
- security hardening
- maintainability
- testing depth
- API/service/frontend alignment

## Baseline snapshot (current repo footprint)

- API routes: `169` files under `src/app/api/**/route.ts`
- Dashboard pages: `86` files under `src/app/(dashboard)/**/page.tsx`
- Service modules: `23` files under `src/lib/services/*.ts`
- Repository modules: `12` files under `src/lib/repositories/*.ts`
- E2E specs: `21` files under `e2e/*.spec.ts`

Use this baseline to track audit progress and coverage.

## Audit outcomes required before "best-in-class" claim

- No open P0 or P1 findings.
- Tenant isolation validation complete for all mutating routes.
- Role matrix implemented and verified in API (not only UI).
- Standard API contracts (validation, error shape, status behavior) enforced.
- Critical user journeys have both happy-path and failure-path tests.
- Observability and audit logging present on sensitive flows.

## Severity model

- `P0` Critical: security breach, cross-tenant leak, privilege escalation, data corruption.
- `P1` High: business logic can fail silently, unauthorized operation possible, missing hard guard.
- `P2` Medium: inconsistent contracts, weak maintainability, flaky tests, non-fatal edge bugs.
- `P3` Low: polish, wording, docs drift, minor UX inconsistencies.

## 4-phase execution plan

## Phase 0 - Setup and freeze (Day 0)

- Freeze new feature merges except critical fixes.
- Create audit branch and issue labels: `audit/p0`, `audit/p1`, `audit/p2`, `audit/p3`.
- Confirm owners:
  - Security + tenancy owner
  - API/backend owner
  - Frontend consistency owner
  - Test and CI owner
  - Docs/governance owner

Deliverables:

- Audit tracker issue board
- Finalized severity rubric
- Scope lock list

## Phase 1 - Discovery and evidence capture (Days 1-3)

- Build route inventory grouped by domain (`admin`, `settings`, `offers`, `assessments`, `scim`, `jobs`, `auth`, `cron`, `webhooks`).
- Build role-route matrix (see `docs/ROLE_ROUTE_MATRIX_AUDIT.md`).
- Run tenancy and security checklist (see `docs/TENANCY_SECURITY_AUDIT_CHECKLIST.md`).
- Run API/service/frontend consistency checklist (see `docs/API_SERVICE_FRONTEND_CONSISTENCY_CHECKLIST.md`).
- Record every finding with reproduction steps and code reference.

Deliverables:

- Findings register (all severities)
- Domain scorecard v1
- Test-gap map

## Phase 2 - Remediation wave (Days 4-10)

Remediate in this order:

1. P0 security/tenancy/authorization
2. P1 logic and contract issues
3. P2 maintainability and consistency
4. P3 polish and docs

Rules:

- Every fix ships with tests (or a documented temporary exception with due date).
- Every risky fix includes rollback notes.
- Every changed route uses shared API helpers and standardized error handling.

Deliverables:

- Closed P0/P1 backlog
- Updated test matrix and CI status
- Re-scored domain quality

## Phase 3 - Certification and guardrails (Days 11-14)

- Re-run full test matrix and targeted exploratory checks.
- Re-score all domains against readiness criteria.
- Add PR and CI guardrails so regressions fail fast.
- Publish final audit report and unresolved debt list with ETAs.

Deliverables:

- Final audit report
- Guardrail checklist in PR template
- Monthly mini-audit cadence

## Domain scorecard (100 points)

- Security + multi-tenancy: `30`
- RBAC and role differentiation: `15`
- API and backend logic correctness: `20`
- Testing maturity and reliability: `15`
- Frontend consistency and authorization UX: `10`
- Maintainability + observability: `10`

Minimum pass:

- `>=90` overall
- no P0/P1 open
- all critical journeys covered by automated tests

## Evidence capture format (required for each finding)

- Finding ID
- Severity
- Domain
- Impact statement
- Reproduction steps
- Expected vs actual behavior
- Affected files/routes
- Fix proposal
- Owner
- ETA
- Test added/updated

## Critical journeys that must be verified end-to-end

- Auth login/logout/session invalidation
- Tenant-scoped access to jobs/candidates/applications
- Admin-only controls (users, org features, plan limits, feature flags)
- Settings and integrations (org + personal)
- Offers lifecycle (create -> finance -> send -> response/expiry)
- Assessments lifecycle (create -> share -> submit -> score/advance)
- Interview prep and scheduling (book/reschedule/cancel)
- SCIM and identity sync flows
- Billing and entitlements enforcement

## CI guardrails to add or enforce

- Fail PR if mutating API route lacks:
  - auth guard
  - role/capability check
  - validation schema
  - standardized error response
- Fail PR when route/domain tests are missing for changed API modules.
- Track flaky E2E tests and auto-quarantine only with owner + expiry.

## Recommended audit cadence

- Weekly: P0/P1 findings triage and closure review.
- Monthly: mini-audit of top risk domains (`auth`, `settings`, `offers`, `assessments`, `scim`).
- Quarterly: full re-audit and scorecard refresh.
