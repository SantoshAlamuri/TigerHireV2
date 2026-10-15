# Test coverage backlog — “whole product” plan

This doc complements [`TEST_COVERAGE_PLAN.md`](./TEST_COVERAGE_PLAN.md). The plan table tracks **core** API routes; the repo has **~300** `src/app/api/**/route.ts` files—many are covered by **specialized** `tests/unit/*` files (offers, assessments, SCIM, platform, etc.) that are not duplicated on every plan row.

## Principles

1. **Unit first** for route handlers: 401 / 403 / 400 / 200 (and domain-specific 402/404/422).
2. **Functional** for multi-step flows (`tests/functional`).
3. **E2E** for critical journeys (`e2e/*.spec.ts`); does not replace handler tests.
4. Keep **`npm run test`** green before raising `test:coverage:strict` thresholds.

## How to find gaps

- Enumerate routes: `find src/app/api -name route.ts`
- Search tests: `rg 'app/api/.*/route' tests/unit`
- Prefer adding **`tests/unit/<feature>-route.test.ts`** next to an existing pattern (see `jobs-orchestrator-route.test.ts`, `cron-trust-route.test.ts`).

## Suggested waves (parallel-friendly)

| Wave   | Scope                         | Examples of remaining / deep coverage                                    |
| ------ | ----------------------------- | ------------------------------------------------------------------------ |
| **W1** | Auth + org + profiles         | Dev-only routes (`test-login`, `seed-demo-users`) optional; SSO variants |
| **W2** | Jobs pipeline + interviews    | Self-schedule links, screening questions, bias, referral-config          |
| **W3** | Candidates + resumes          | Already strong; extend edge cases / tenancy                              |
| **W4** | Offers + approvals + hiring   | Public tokens, signing, hiring-manager approve                           |
| **W5** | Assessments + FitScore aux    | Share tokens, templates, batch scoring                                   |
| **W6** | Integrations + webhooks       | SpringVerify, OAuth callbacks, marketplace                               |
| **W7** | Admin + platform + compliance | Costs, export, DSR, retention                                            |
| **W8** | Cron + agents + Inngest       | Remaining `cron/*`, `agents/*`, durable jobs                             |

Each wave can be owned by a separate branch or agent; merge only with **green Vitest** for touched tests.

## Definition of done (per route)

- [ ] Unauthenticated → **401** (or correct public behavior).
- [ ] Wrong role → **403** where applicable.
- [ ] Invalid body/query → **400** / **422**.
- [ ] Happy path → **200** / **201** with minimal JSON shape assertion.
- [ ] **`TEST_COVERAGE_PLAN.md`** row updated if the route is listed there.

## CI (optional next step)

- Add a job that runs `npm run test` (and optionally `npm run test:coverage` without strict gates).
- Use **`test:coverage:strict`** only after the suite is stable and thresholds are agreed.
