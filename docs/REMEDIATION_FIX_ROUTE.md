# Remediation Fix Route (Implementation Path)

**Related:** [REMEDIATION_ACTIONS_LIST.md](./REMEDIATION_ACTIONS_LIST.md) (by owner), [AUDIT_REMEDIATION_TRACKER.md](./AUDIT_REMEDIATION_TRACKER.md) (source audit context).

This is the concrete fix route to close gaps end-to-end. It is implementation-focused and maps fixes to files and tests.

## Priority order

1. P0 tenancy/security route fixes
2. P1 role and contract fixes
3. consistency and maintainability refactors
4. regression and rollout hardening

## Sprint 1 - P0 closure

## A) Offers mutation org-ownership enforcement

Routes:

- `src/app/api/offers/[id]/finance/route.ts`
- `src/app/api/offers/[id]/send/route.ts`
- `src/app/api/offers/[id]/response/route.ts`
- `src/app/api/offers/route.ts` (finance notification scoping)

Fix tasks:

- [ ] enforce `organisation_id` match from auth context before update/mutation.
- [ ] reject cross-org records with `403`/`404` policy.
- [ ] scope finance user selection by organisation for notifications.
- [ ] ensure consistent denial statuses.

Tests to update/add:

- `tests/unit/offers-routes.test.ts`
- [ ] add cross-org ID mutation denial tests
- [ ] add org-scoped finance notification recipient tests

## B) Assessments scoring ownership enforcement

Routes:

- `src/app/api/assessments/[id]/score/route.ts`
- `src/app/api/assessments/[id]/submit/route.ts` (re-verify parity)

Fix tasks:

- [ ] enforce assessment -> application -> job organisation ownership before score mutation.
- [ ] ensure reviewer role does not bypass tenant boundary.
- [ ] standardize state-machine error responses.

Tests to update/add:

- `tests/unit/assessments-routes.test.ts`
- [ ] add cross-org scoring denial tests
- [ ] add non-owner reviewer denial tests

## C) Tenant boundary checks for scheduling mutations

Routes:

- `src/app/api/jobs/[id]/interviews/book/route.ts`
- `src/app/api/jobs/[id]/interviews/reschedule/route.ts`
- `src/app/api/jobs/[id]/interviews/cancel/route.ts`

Fix tasks:

- [ ] verify `pipeline_candidate` belongs to same job+org at each mutation step.
- [ ] enforce deterministic conflict handling under concurrent slot mutation.

Tests:

- `tests/unit/jobs-interviews-book-route.test.ts`
- `tests/unit/jobs-interviews-reschedule-route.test.ts`
- [ ] add concurrent and cross-org mutation attempts

---

## Sprint 2 - Standardization and hardening

## D) Protected route guard standard

Scope:

- all protected route handlers under `src/app/api`

Fix tasks:

- [ ] normalize guard sequence: auth -> role/capability -> tenant ownership -> validation -> mutation.
- [ ] normalize error response patterns.
- [ ] ensure mutating browser routes include CSRF where applicable.

Tests:

- `tests/contract/error-handling-consistency.test.ts`
- `tests/contract/api-response-shapes.test.ts`
- [ ] add route-guard conformance checks for modified paths

## E) Tenant-scoped strategy rollout

Scope:

- high-risk route families first (`offers`, `assessments`, `jobs` mutations, `settings`)

Fix tasks:

- [ ] adopt tenant-scoped client or equivalent explicit ownership assertions.
- [ ] document justified exceptions if raw clients must remain.

Tests:

- `tests/integration/multi-tenant-isolation.test.ts`
- `tests/security/role-escalation.test.ts`
- [ ] add endpoint-specific boundary tests where missing

---

## Sprint 3 - Maintainability and observability

## F) Duplicate logic extraction

Targets:

- provider resolution duplication across interview routes

Fix tasks:

- [ ] extract shared resolver utility for calendar/room/transcript checks.
- [ ] remove handler duplication and centralize error messages.

Tests:

- [ ] unit tests for shared resolver behavior
- [ ] handler tests updated to use shared flow

## G) Observability completion

Fix tasks:

- [ ] ensure critical routes include structured context in error logs.
- [ ] add audit log coverage for sensitive mutations.
- [ ] verify alert routing for 401/403/5xx spikes in critical endpoints.

---

## Release readiness execution steps

1. Implement fixes in branch waves by domain.
2. Run domain tests after each wave.
3. Run full regression before merge cutoff.
4. Build evidence packet for sign-off.
5. Execute formal go/no-go checklist.

---

## Merge policy during remediation

- [ ] no critical fix PR without tests
- [ ] no PR with unresolved P0/P1 in changed domain
- [ ] no skipped critical tests without owner + due date
- [ ] no rollout without updated runbook if behavior changed
