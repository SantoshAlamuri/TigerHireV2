# Audit Test Execution Matrix

This matrix maps audit domains to concrete automated test runs.

## Fast smoke (run on every remediation PR)

```bash
npx vitest run tests/unit
npx vitest run tests/functional
npx playwright test e2e/admin-flow.spec.ts e2e/settings.spec.ts e2e/recruiter-flow.spec.ts
```

## Domain-specific runs

## Role and permission domain

- E2E:
  - `e2e/admin-flow.spec.ts`
  - `e2e/admin-entitlements.spec.ts`
  - `e2e/settings.spec.ts`
- Add/ensure:
  - denied-role tests for admin/settings/offers/assessments/interview routes

## Tenancy and security domain

- Functional/unit focus:
  - auth + route guards under `tests/functional/**`
  - tenancy-scoped repository tests under `tests/unit/**`
- Add/ensure:
  - cross-tenant negative tests for every high-risk domain

## Offers and assessments domain

- E2E:
  - `e2e/feature-happy-paths.spec.ts`
  - `e2e/assessments-prep-risks.spec.ts`
- Unit/functional:
  - offers routes and assessment routes test suites
- Add/ensure:
  - illegal state transition tests
  - expiry/deadline boundary tests

## Settings and integrations domain

- E2E:
  - `e2e/settings.spec.ts`
  - `e2e/settings-to-interview.spec.ts`
  - `e2e/personal-settings.spec.ts`
- Unit/functional:
  - settings API and repository tests
- Add/ensure:
  - secret masking and audit-log assertions

## Interview scheduling and prep domain

- E2E:
  - `e2e/assessments-prep-risks.spec.ts`
  - targeted interview scheduling flow tests
- Unit:
  - interview booking/rescheduling route suites
- Add/ensure:
  - duplicate booking race and permission denials

## Public and candidate flows

- E2E:
  - `e2e/public-pages.spec.ts`
  - `e2e/apply-flow.spec.ts`
  - `e2e/candidate-flow.spec.ts`
- Add/ensure:
  - invalid token / expired link / already-submitted cases

## Full regression before audit sign-off

```bash
npx vitest run
npx playwright test
```

## Gate criteria

- No failing tests in critical path suites.
- No skipped tests without issue link and owner.
- No flaky test accepted without mitigation plan and due date.
- New P0/P1 fix cannot merge without regression tests.
