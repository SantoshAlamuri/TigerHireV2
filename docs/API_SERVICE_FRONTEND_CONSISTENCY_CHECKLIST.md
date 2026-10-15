# API Service Frontend Consistency Checklist

Use this checklist to detect inconsistent behavior, bad logic, and unfinished implementation across route handlers, service layer, and UI.

## API route consistency checks

- Request validation exists for all mutating endpoints.
- Response shape is stable and documented for success and errors.
- Status codes are semantically correct and consistent across similar routes.
- Catch blocks use centralized error handling.
- Pagination, filtering, and sorting semantics are consistent where list endpoints exist.
- Contract changes are reflected in API docs and consumer code.

## Backend logic and domain invariants

- State machines enforce legal transitions only (offers, assessments, interviews).
- Time-based logic uses clear source-of-truth timestamps and timezone-safe comparisons.
- Concurrent updates are protected (transaction, lock, optimistic checks, or atomic RPC).
- Side effects (notifications, webhooks, downstream writes) occur once and are retry-safe.

## Service/repository boundary checks

- Route handlers orchestrate; services contain business logic; repositories encapsulate data access.
- No duplicated business rules across route files.
- No repository function with mixed unrelated domain concerns.
- Naming and return shapes are predictable across modules.

## Frontend consistency checks

- Similar workflows use shared UX patterns (loaders, errors, empty states, success toasts).
- Role-based route visibility matches backend authorization.
- Forms show server validation messages consistently.
- Mutation flows disable duplicate submissions and show deterministic completion states.
- Deep links and query-param features have fallback behavior for invalid values.

## "Unfinished business" detection checklist

- Placeholder pages/routes exist without backend completion.
- Feature flag paths expose links to non-production-ready flows.
- Newly added APIs lack tests or UI integration.
- Dashboard cards link to incomplete pages.
- TODO/FIXME/HACK markers remain in critical paths.

Quick scan:

```bash
rg "TODO|FIXME|HACK|TEMP|placeholder|coming soon" src/app src/lib
```

## Test alignment checks

- Every mutating API route has at least one failure-path test.
- Every critical user journey has one E2E happy-path test.
- Known high-risk domains have explicit authorization and tenancy tests.
- Flaky tests are tracked with root cause and resolution ETA.

## Maintainability checks

- Large route files are split by concern where practical.
- Duplicate validation logic is extracted to shared schemas.
- Shared utilities are used instead of copy/paste helpers.
- Logging context is consistent for debugging production incidents.

## Definition of done for a domain

A domain is audit-complete only if:

- route contracts are consistent
- role and tenancy controls are verified
- tests cover success + failure + unauthorized paths
- documentation is updated for actual behavior
- no open P0/P1 findings remain
