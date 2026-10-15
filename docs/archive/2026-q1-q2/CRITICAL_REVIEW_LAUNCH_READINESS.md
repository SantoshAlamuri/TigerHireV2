# Critical Review: Test Failures & Launch Readiness

**Date:** 2026-03-07  
**Scope:** Test suite results, failure root causes, gaps vs launch

---

## 1. Executive summary

| Metric                              | Status                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| **Test suite**                      | Multiple failures across unit, functional, performance, stress                   |
| **Build**                           | Next.js build started; not confirmed complete in captured run                    |
| **Launch readiness**                | **Not ready** — auth, apply, public routes, types, and mocks must be fixed first |
| **Estimated effort to green tests** | 1–2 days (mocks + test expectations + a few env/behavior fixes)                  |

**Verdict:** Fix mock and expectation mismatches first (fast wins). Then run full suite and address any remaining route/env failures. Re-run build and E2E before considering launch.

---

## 2. Test failures by area

### 2.1 Auth routes (blocking for launch)

| File                              | Failing tests | Root cause                                                                                                                                                                        |
| --------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **auth-register-route.test.ts**   | 4/4           | Mock for `@/lib/security/rate-limit` does not export `RATE_LIMIT_PRESETS`. Register route imports it; Vitest throws when the mock omits it.                                       |
| **auth-login-route.test.ts**      | 3/4           | Login route calls `supabase.auth.signOut()` before sign-in; mock only provides `signInWithPassword` and `getUser`. Mock needs `signOut: () => Promise.resolve()` (or equivalent). |
| **functional/auth-flows.test.ts** | 4/10          | Depends on register/login behavior and possibly live or partially mocked Supabase; fix unit mocks first, then re-run.                                                             |

**Fixes:**

- **auth-register-route.test.ts:** Add `RATE_LIMIT_PRESETS` to the `vi.mock("@/lib/security/rate-limit")` object (same shape as in `auth-login-route.test.ts`: at least `auth` and any other presets the route uses).
- **auth-login-route.test.ts:** In the Supabase server mock, add `signOut: vi.fn().mockResolvedValue(undefined)` to the `auth` object.

---

### 2.2 Apply & public routes (critical for apply flow)

| File                      | Failing tests | Root cause                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **apply-routes.test.ts**  | 6/10          | (1) Apply route uses `RATE_LIMIT_PRESETS.apply` and `withIdempotency`. Mock only provides `checkRateLimit`; missing `RATE_LIMIT_PRESETS` causes runtime error. (2) `withIdempotency` may need to be mocked to invoke the inner handler directly, or the test request may need an idempotency key. |
| **public-routes.test.ts** | 9/14          | Contact (and possibly waitlist) use `RATE_LIMIT_PRESETS.publicForm`. Rate-limit mock does not export `RATE_LIMIT_PRESETS`, so the route throws when spreading presets.                                                                                                                            |

**Fixes:**

- **apply-routes.test.ts:** Add `RATE_LIMIT_PRESETS` to the rate-limit mock (include `apply`). If the route still fails inside `withIdempotency`, mock `@/lib/security/idempotency` so `withIdempotency(request, key, fn)` just calls `fn()`.
- **public-routes.test.ts:** Add `RATE_LIMIT_PRESETS` to the rate-limit mock (include `publicForm` and any other presets used by contact/waitlist).

---

### 2.3 Types & mappers (out-of-date expectations)

| File                | Failing tests | Root cause                                                                                                                                                                                                                                                                                 |
| ------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **types.test.ts**   | 8/17          | Implementation uses **v4 bands**: 90+ Strong, 75–89 Good, 60–74 Moderate, &lt;60 Weak (no “Poor”). Tests still expect **old bands**: 80+ Strong, 65–79 Good, 50–64 Moderate, 35–49 Weak, &lt;35 Poor, and “Poor” label.                                                                    |
| **mappers.test.ts** | 2/42          | (1) “maps a DB row to FitScore”: row has `overall_score: 82`; `getFitScoreRating(82)` now returns “Good Match” (75–89), test expects “Strong Match”. (2) “defaults to 0 for missing overall_score”: test expects `rating === "Poor"`, but implementation returns “Weak” for score &lt; 60. |

**Fixes:**

- **types.test.ts:** Align all expectations with `src/types/index.ts`: 90+ Strong Match, 75–89 Good Match, 60–74 Moderate, &lt;60 Weak. Remove “Poor” and adjust score boundaries and color tests (emerald/amber/orange/red) to match.
- **mappers.test.ts:** For the row with `overall_score: 82`, expect `rating` to be `"Good Match"`. For the minimal row with no `overall_score`, expect `rating` to be `"Weak"` (not “Poor”).

---

### 2.4 Other unit tests

| File                              | Failing      | Likely cause                                                                                                            |
| --------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **resume-versions-route.test.ts** | 2            | Supabase mock chain (e.g. insert/single/select) or auth not matching route usage.                                       |
| **employees-routes.test.ts**      | 2            | One test “returns 401 when unauthenticated” and one “returns 201 on successful referral” — auth or referral mock shape. |
| **profile-service.test.ts**       | 1            | “returns profile with candidate record for candidate_pro” — role or candidate lookup mock.                              |
| **job-service.test.ts**           | 1            | “returns jobs with pagination metadata” — repository or response shape.                                                 |
| **route-span.test.ts**            | (from audit) | Sentry `startSpan` mock or route name not matching.                                                                     |
| **fitscore-routes.test.ts**       | (from audit) | 403 candidate / 201 compute — auth or compute path.                                                                     |

These need a pass after the auth and rate-limit mocks are fixed; then fix any remaining mock/assertion mismatches.

---

### 2.5 Functional, performance, stress

| File                                         | Failing | Note                                                                                                                                |
| -------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **functional/auth-flows.test.ts**            | 4/10    | Depends on auth route behavior; fix auth unit mocks first.                                                                          |
| **stress/concurrent-service-calls.test.ts**  | 1       | “handles 100 concurrent JobService.list calls” — timeout or resource limit; may need higher timeout or lighter concurrency in CI.   |
| **performance/circuit-breaker-perf.test.ts** | 1       | “open-state rejection: > 100,000 ops/sec” — threshold may be too high for environment; consider env-specific threshold or relaxing. |

---

## 3. Gaps for launch (testing & identification)

### 3.1 Must fix before launch

1. **All tests green (or explicitly skipped with ticket)**  
   Current failures block confidence in auth, apply, and public forms. Fix order: rate-limit + auth mocks → apply/public → types/mappers → remaining unit/functional/stress/perf.

2. **Rate-limit mock pattern**  
   Any route that imports `RATE_LIMIT_PRESETS` from `@/lib/security/rate-limit` must have a mock that exports the same presets (or use `vi.mocked`/`importOriginal` for a partial mock). Apply to: auth-register, apply, contact, waitlist, and any other route using presets.

3. **Auth client mock**  
   Login route calls `signOut()`; mock must implement it. Any other route that uses Supabase auth should be checked for missing methods on the auth mock.

4. **Idempotency in tests**  
   Apply route is wrapped in `withIdempotency`. Either mock it so the handler runs directly or provide a valid idempotency key in the request so behavior is deterministic.

### 3.2 Good to have before launch

- **Coverage gate:** `docs/TESTING.md` targets ≥80% coverage; add a CI step that fails below that (or a lower threshold) so regressions are visible.
- **E2E for apply flow:** After unit tests for apply are green, run Playwright (or equivalent) for the full apply path (upload, slug, success/error).
- **Build and E2E in CI:** Ensure `npm run build` and `npm run test:e2e` (or `test:e2e:functional`) run in CI and are required for merge.

### 3.3 Already in good shape (from audit)

- Lint passes.
- Many unit tests pass (resume-versions, apply error path, public 500 paths, profile-service majority, job-service majority, mappers majority).
- Fitscore scorer test passes.
- Security: no hardcoded secrets in `src`; sensitive routes gated.

---

## 4. Recommended order of work

1. **Rate-limit mock**  
   Add `RATE_LIMIT_PRESETS` to every `vi.mock("@/lib/security/rate-limit")` that currently only mocks `checkRateLimit` (auth-register, apply, public-routes, and any other failing route using presets).

2. **Auth mocks**  
   In auth-login mock, add `signOut` to the Supabase auth object. Re-run auth-register and auth-login tests.

3. **Apply route**  
   Add `RATE_LIMIT_PRESETS` (and optionally mock `withIdempotency`). Re-run apply-routes tests.

4. **Public routes**  
   Add `RATE_LIMIT_PRESETS` to public-routes test rate-limit mock. Re-run public-routes tests.

5. **Types and mappers**  
   Update types.test.ts and mappers.test.ts to match current fit-score bands and labels (90/75/60, no “Poor”).

6. **Remaining unit/functional**  
   Run full suite; fix resume-versions, employees-routes, profile-service, job-service, route-span, fitscore-routes per failure message.

7. **Stress/perf**  
   Adjust timeouts or thresholds for concurrent-service-calls and circuit-breaker-perf if needed for CI.

8. **Build + E2E**  
   Run `npm run build` and `npm run test:e2e` (or functional E2E); fix any failures.

---

## 5. How far from launch?

| Criterion                                        | Status                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| Unit tests (auth, apply, public, types, mappers) | **Red** — fix mocks and expectations above.                              |
| Other unit tests                                 | **Amber** — fix after shared mocks are in place.                         |
| Functional / E2E                                 | **Amber** — depend on auth and apply; run after unit fixes.              |
| Build                                            | **Amber** — verify build completes and is in CI.                         |
| Security / secrets                               | **Green** (from audit).                                                  |
| Dependencies (audit)                             | **Amber** — 10 vulnerabilities; run `npm audit fix` and track remaining. |

**Summary:** You are **not** at launch until the test suite is green (or failures are documented and accepted with tickets). Focus on the mock and expectation fixes in Sections 2–4; that should clear most failures and give a clear picture of any remaining gaps.
