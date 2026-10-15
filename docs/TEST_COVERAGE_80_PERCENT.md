# 80% Functionality Test Coverage

This document defines how we measure and maintain **80% test coverage of functionality** for TigerHire.

## Definition of “80% of functionality”

We count **API route actions** (one per HTTP method per route path) as the primary surface of functionality:

- **Total API actions** ≈ 120+ (each `GET`, `POST`, `PATCH`, `DELETE` on each route)
- **Target:** ≥ 80% of these actions have **at least one test** that exercises the handler (auth, validation, or success path)
- **In scope:** All routes under `src/app/api/**/route.ts`
- **Out of scope:** Debug/dev-only routes, optional seed scripts, E2E-only flows (counted separately)

## How we count coverage

| Category               | Count (approx) | Covered by tests                                                                      |
| ---------------------- | -------------- | ------------------------------------------------------------------------------------- |
| Health & public        | 4              | health, contact, waitlist, count                                                      |
| Auth                   | 14             | login, register, sso, link, forgot-password, logout                                   |
| Jobs                   | 25+            | jobs, [id], public, shortlist, availability, interviews, feedback, pipeline-stages    |
| Applications           | 4              | list, create, [id] GET/PATCH                                                          |
| Candidates             | 12+            | list, [id], matches                                                                   |
| Fit score              | 2              | POST, [id] GET                                                                        |
| Hiring requests        | 4              | list, create, [id] GET/PATCH                                                          |
| Approvals              | 1              | GET                                                                                   |
| Pipeline / my-pipeline | 2              | my-pipeline, pipeline-stages                                                          |
| Billing                | 2              | checkout, portal                                                                      |
| Notifications/Messages | 4              | notifications, messages, [conversationId]                                             |
| Profiles / preferences | 4              | profiles, email-preferences                                                           |
| Admin                  | 16             | users, orgs, feature-flags, agents, analytics, billing, plan-limits, scrape           |
| Agency                 | 12             | clients, upload, bulk, reprocess, backfill, rescore                                   |
| Employees              | 10             | refer, my-referrals, open-positions, resign, dispute                                  |
| Public / Apply         | 4              | contact, waitlist, count, apply, apply/[slug]                                         |
| Invites                | 2              | [token] GET/POST                                                                      |
| Cron                   | 10+            | cleanup, reminders, job-alerts, process-signals, resignations                         |
| Webhooks               | 2              | stripe                                                                                |
| Other                  | 8+             | organisations, members, saved-searches, [id], resume-versions, feedback/hire, openapi |

**Covered** = at least one unit or functional test file imports the route and asserts status (e.g. 401, 403, 200).

## Test files that contribute to 80%

- **Unit:** `tests/unit/*.test.ts` — route handlers, auth, validation, status codes
- **Functional:** `tests/functional/*.test.ts` — multi-step flows
- **E2E:** `e2e/*.spec.ts` — full user flows (supplement coverage, not primary for 80% count)

New route tests added for 80% target (see also `TEST_COVERAGE_PLAN.md`):

- `auth-logout-route.test.ts`
- `jobs-public-route.test.ts`
- `jobs-shortlist-route.test.ts`
- `saved-searches-id-route.test.ts`
- `organisations-members-route.test.ts`
- (openapi: optional; use integration or manual test)
- `agency-rescore-route.test.ts`
- `feedback-hire-route.test.ts`
- `messages-conversationId-route.test.ts`
- `cron-extra-routes.test.ts` (e.g. resignations)

## Running and enforcing

```bash
# Run all unit tests
npm run test:unit

# Run with coverage (lines/branches/functions)
npm run test:coverage
```

CI can enforce:

1. **Action coverage:** ≥ 80% of API route actions have at least one test (manual or scripted audit vs `TEST_COVERAGE_PLAN.md`).
2. **Code coverage:** Vitest thresholds (e.g. 70% lines/branches/functions) in `vitest.config.ts`.

## Adding tests for new functionality

When adding a new API route or method:

1. Add at least one test in `tests/unit/` (or `tests/functional/` for flows).
2. Cover: unauthenticated → 401; wrong role → 403; invalid input → 400/422; valid → 200/201.
3. Update `docs/TEST_COVERAGE_PLAN.md` with the new route and test file.
4. Re-check that total covered actions remain ≥ 80%.
