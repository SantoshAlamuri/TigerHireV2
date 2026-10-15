# TigerHire Testing Guide

## Overview

| Layer           | Location / tool                         | Notes                                                                   |
| --------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| **Unit**        | `tests/unit/`, `src/**/*.test.{ts,tsx}` | Vitest, jsdom                                                           |
| **Integration** | `tests/integration/`                    | Some suites **skipped** without live Supabase (see file headers)        |
| **Functional**  | `tests/functional/`                     | API and lifecycle smokes                                                |
| **Component**   | `tests/component/`                      | React Testing Library                                                   |
| **Performance** | `tests/performance/`                    | `npm run test:perf`                                                     |
| **Stress**      | `tests/stress/`                         | `npm run test:stress`                                                   |
| **E2E (UI)**    | `e2e/*.spec.ts`                         | Playwright (`playwright.config.ts` — Chromium, `http://localhost:3000`) |
| **Load (HTTP)** | `k6/*.js`                               | `npm run k6:load` etc. — **requires [k6](https://k6.io/)** on `PATH`    |

`vitest.config.ts` reports `src/**` coverage on `npm run test:coverage`. **Line/branch gate (70%)** runs only with `VITEST_ENFORCE_COVERAGE=1` or `npm run test:coverage:strict` — use it when approaching the threshold; use `coverage/lcov-report/index.html` for drill-down.

## Commands

```bash
npm run test                    # Vitest (watch)
npm run test:all                # Single run, all Vitest tests
npm run test:unit               # tests/unit only
npm run test:functional
npm run test:component
npm run test:integration
npm run test:perf            # tests/performance
npm run test:stress          # tests/stress
npm run test:coverage           # v8 + lcov; exits 0 (no global threshold)
npm run test:coverage:strict   # same + fail if coverage is below 70% (VITEST_ENFORCE_COVERAGE=1)
npm run test:critical         # scripts/run-verification-bundle.mjs critical
npm run test:ga-sweep
npm run test:release-gate     # alias for test:ga-sweep
npm run test:e2e              # Playwright smoke project (blocks dev→main via release-gate:dev)
npm run test:e2e:smoke        # Same as test:e2e
npm run test:e2e:full         # All Playwright specs (smoke + full projects)
npm run k6:load               # k6 — install k6 first
npm run k6:stress
npm run k6:soak
npm run k6:benchmark
```

## Product surface — what is covered (2026-04-24)

**Automated unit/functional** exercise API routes, services, state machines, screening math, webhooks, offers, auth (with mocks), and dashboard components. Newer routes also have dedicated tests, e.g. `GET` public screening questions, `GET` self-serve schedule (invalid token), `GET` application communications (unauthenticated).

**Playwright** covers public marketing pages, role dashboards, apply, recruiter/candidate/admin flows, responsive/a11y checks, UI regression, and launch smoke. `playwright.config.ts` loads `.env.local` / `.env` into the test process. Set **`E2E_APPLY_ORG_SLUG`** to an `organisations.slug` that exists in Supabase (see `.env.example`); default in code is **`razorpay`**. **Auto-sync from your DB into `.env.local`:** `npm run e2e:sync-apply-slug` (picks `razorpay` if present, else first org with an open job, else first org). GitHub Actions can set the **`E2E_APPLY_ORG_SLUG`** repository secret. Expect failures when the DB is empty, demo users are missing, or the slug is wrong.

**CI (PR)**: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs E2E and k6 (after a successful build) with Supabase secrets, `BASE_URL=http://localhost:3000` for k6, and optional `E2E_APPLY_ORG_SLUG`.

## Last full run recorded in this session (2026-04-24)

| Suite                                                               | Result                                                             | Notes                                                                                                                                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run` (all)                                              | **331 files passed**, 5 skipped; **2476 tests passed**, 28 skipped | Includes auth rate-limit mock fixes and new route tests (screening, self-serve, communications)                                                                                                                               |
| `npx vitest run --coverage`                                         | **Exits 0** (report only)                                          | Enforce 70% with `npm run test:coverage:strict`                                                                                                                                                                               |
| `npx playwright test` (after selector fixes + `E2E_APPLY_ORG_SLUG`) | **~128 passed**, **~28 failed** (varies with DB)                   | Public/apply/launchsmoke pass when copy matches the UI. Remaining failures are mostly **auth + role dashboards** (need seeded `seed-demo-users`, Finstack, matching passwords) and **CSP/recharts**, **tabs** while logged in |
| k6                                                                  | **Not executed**                                                   | `k6` binary not present in the runner environment                                                                                                                                                                             |

## Fixes applied for stability (auth + rate limit)

- Routes using `getClientIpForRateLimit` + `checkRateLimit` need Vitest mocks to export **`getClientIpForRateLimit`**, **`checkRateLimit`**, and **`RATE_LIMIT_PRESETS`** (see `tests/unit/auth-link-route.test.ts`, `auth-google-route`, `auth-ensure-profile-route`, `csrf-token-route`, `auth-sso-route`).
- `POST /api/auth/ensure-profile` tests must pass a **`NextRequest`** with a JSON body (`{}`); the handler reads `request.json()`.
- **API route mocks**: include `handleApiError` in `vi.mock("@/lib/api-helpers")` when the route uses it.
- **Apply / availability** mocks: include correct query chains and `headers: new Headers()` where the route reads headers.
- **Messages**: One test may be skipped (`POST to conversation sends a message`) due to mock complexity.

## Component tests

Component tests use `@testing-library/react` and `@testing-library/dom`. If you see "Cannot find module '@testing-library/dom'", run `npm install`. Async state updates may need to be wrapped in `act()` to avoid warnings.

## See also

- [UI_TESTING_GUIDE.md](./UI_TESTING_GUIDE.md)
- [FEATURES_AND_TEST_CASES.md](./FEATURES_AND_TEST_CASES.md) (if present)
- [launch/AGENCY-BULK-RESCORE-BACKFILL-QA.md](./launch/AGENCY-BULK-RESCORE-BACKFILL-QA.md) — manual QA for `agency` bulk rescore / backfill API paths
- [../README.md](../README.md) — one-line test commands
