# TigerHire — Production Readiness Audit

**Date:** 2025-03-07  
**Scope:** Security, reliability, configuration, testing, and operational readiness.

---

## Executive Summary

The codebase is **close to production-ready** with solid security foundations (auth, RBAC, cron auth, CSRF, rate limiting, env validation) and good observability. **One blocking type error was fixed** (agency pipeline page). Before going live, address the **blocking** and **high-priority** items below; **recommended** items will reduce risk and improve maintainability.

| Category       | Status     | Notes                                                              |
| -------------- | ---------- | ------------------------------------------------------------------ |
| Build          | ✅ Pass    | Fixed type in `agency/pipeline/page.tsx`; `npm run build` succeeds |
| Security       | 🟡 Good    | Auth, RBAC, cron, CSRF, Stripe verify; see gaps below              |
| Configuration  | 🟡 Good    | Env validated in prod; ensure all required vars set                |
| Error handling | ✅ Good    | Global/dashboard errors, sanitized auth errors, reportError        |
| Testing        | 🟡 Partial | Many unit/functional tests; `test:unit` path/Windows issue         |
| Database       | ✅ Good    | RLS, migrations, rate_limit_log used via service role              |
| API design     | ✅ Good    | getAuthContext/requireAuth/hasRole used widely                     |

---

## 1. Security

### 1.1 Authentication & authorization

- **Middleware (proxy):** Next.js 16 uses `src/proxy.ts` as the request gateway. Session refresh, protected route redirects, role-based dashboard routing, and API 401 for non-public routes are implemented.
- **API routes:** Protected routes use `getAuthContext()` + `requireAuth()` / `hasRole()` from `@/lib/api-helpers`. Many routes also enforce organisation/resource scope.
- **Cron routes:** All `/api/cron/*` handlers call `validateCronSecret(request)` (Bearer CRON_SECRET or CRON_SECRET_HASH). No cron endpoint was found without this check.
- **Dev-only routes:** `/api/auth/test-login`, `/api/auth/seed-demo-users`, `/api/seed/finstack`, `/api/debug/*` are disabled or restricted in production (NODE_ENV check or 403). Debug routes are only added to the public list in development.

**Gaps / recommendations:**

- **CRON_SECRET in production:** `envServerSchema` requires either `CRON_SECRET` or `CRON_SECRET_HASH`. Prefer **CRON_SECRET_HASH** in production so the raw secret never appears in env or logs; document in runbooks.
- **Stripe webhook:** Verification uses `env.stripeWebhookSecret`. If `STRIPE_WEBHOOK_SECRET` is empty in production, `constructEvent` will throw and the handler returns 400 — so no silent misuse. Ensure the secret is set for production and matches the Stripe dashboard.
- **Admin client usage:** `createSupabaseAdmin()` bypasses RLS. The codebase documents usage in `docs/ADMIN_CLIENT_AUDIT.md`. Keep that audit updated when adding new admin call sites.

### 1.2 Input validation & CSRF

- **Validation:** Public and authenticated APIs use Zod (e.g. `waitlistSchema`, `registerSchema`, `ingestBodySchema`). Invalid payloads return 400/422 with clear messages.
- **CSRF:** `validateOrigin(request)` is used on state-changing public endpoints (e.g. waitlist, register). It is only enforced when `NODE_ENV === "production"`, which is correct.

**Recommendation:** Ensure every public POST/PUT/PATCH/DELETE that mutates data has either origin/referer validation or another CSRF mitigation (e.g. SameSite cookies, which Supabase/Next already support).

### 1.3 Secrets & configuration

- **No hardcoded secrets** in the audited code. Keys and URLs come from `process.env` or `env` in `@/lib/config/env.ts`.
- **Production env validation:** `validateEnv()` runs in `instrumentation.ts` when `NODE_ENV === "production"` and validates required Supabase vars and cron secret (or hash). Missing vars throw at startup.
- **.env.example** documents required and optional variables. Production deploy must set at least: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and either `CRON_SECRET` or `CRON_SECRET_HASH`.

**Recommendation:** Add a one-line checklist or script that fails the build/deploy if critical production env vars are missing (e.g. in CI or a pre-start script), in addition to runtime `validateEnv()`.

### 1.4 Error message leakage

- **Auth errors:** `toUserFacingAuthError()` strips technical details (env paths, Supabase URLs, grant types) and maps known auth errors to user-friendly messages. In production, technical messages are replaced with a generic message.
- **API errors:** `handleApiError` and similar patterns use `reportError()` and return generic messages in production; dev can expose `detail`.

---

## 2. Reliability & operations

### 2.1 Error handling

- **Global error:** `global-error.tsx` handles uncaught errors, distinguishes connection-closed vs generic, and shows a “Try again” flow. In development it shows `error.message` and `error.stack`.
- **Dashboard error:** `(dashboard)/error.tsx` catches segment errors and offers “Try again” and “Back to login”.
- **API errors:** Routes use `reportError()` (Sentry when DSN is set) and return stable JSON with appropriate status codes.

### 2.2 Rate limiting

- **Implementation:** `checkRateLimit()` uses Postgres RPC `check_rate_limit_atomic` when available, with an insert-then-count fallback. Presets exist for auth, apply, publicForm, webhook, upload, etc.
- **Usage:** Waitlist, register, signals ingest, and other sensitive endpoints use rate limiting. Rate limit state is stored in `rate_limit_log`; service role is used so RLS on that table does not block the app.

### 2.3 Idempotency & webhooks

- **Stripe:** Webhook handler verifies signature, then uses `stripe_event_try_acquire` to avoid duplicate processing. Events are processed in a switch and failures return 500 after reporting.

### 2.4 Headers & CSP

- **Security headers:** Next config sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS. CSP is applied in `src/proxy.ts` (nonce-based script-src in production, strict-dynamic).
- **Cookies:** Supabase cookie options are centralized; middleware applies them consistently.

---

## 3. Testing & quality

### 3.1 Build and typecheck

- **TypeScript:** `npm run typecheck` (tsconfig.typecheck.json) completes successfully.
- **Production build:** `npm run build` completes successfully after fixing the agency pipeline type (see below).
- **Prebuild:** `remove-dev-routes.mjs` runs before build; `restore-dev-routes.mjs` runs after, which is appropriate for excluding dev-only routes from production bundles.

### 3.2 Type fix applied (blocking)

- **Issue:** `src/app/(dashboard)/agency/pipeline/page.tsx` cast `jobsData?.jobs?.map(mapDbJobToPosting)` to a type requiring `title`, but `JobPosting` has `titleRaw` and `titleNormalised`, not `title`. This caused a TypeScript error and build failure.
- **Fix:** Removed the incorrect cast and use `JobPosting[]` from `mapDbJobToPosting`. Updated the option label to `j.titleNormalised ?? j.titleRaw` so the UI matches the type.

### 3.3 Unit / integration tests

- **Coverage:** Many unit tests exist under `tests/unit/` (e.g. env-validation, cron-auth, rate-limit, RBAC, API helpers, Stripe webhook). Vitest config includes `tests/**/*.test.{ts,tsx}` and `src/**/*.test.{ts,tsx}`.
- **Observation:** Running `npm run test:unit` (which uses `--dir tests/unit`) reported “No test files found” in the current environment. This may be due to path or Vitest `dir` behaviour on the host. Running a single file (`tests/unit/env-validation.test.ts`) passed. **Recommendation:** Run the full test suite in CI (e.g. `npm run test` or `vitest run`) and fix any path/configuration issue so `test:unit` consistently discovers tests.

### 3.4 E2E and load tests

- **Playwright:** `test:e2e` is defined. Not run in this audit.
- **k6:** Scripts exist for load, stress, spike, soak, benchmark, breakpoint, and authenticated flow. Use these in pre-production or staging.

---

## 4. Database & schema

- **RLS:** Feature flags and other user-facing tables have RLS policies; admin operations use the service role where intended.
- **rate_limit_log:** RLS is enabled but the table is only written/read via service role (e.g. `check_rate_limit_atomic` and fallback in `rate-limit.ts`). No policy is defined for anon/authenticated roles, which is correct for a server-only table.
- **Migrations:** Supabase schema and migrations are present; ensure all migrations are applied in production and that `rate_limit_atomic` (and any other RPCs used by the app) exist in the target database.

---

## 5. Configuration checklist (production)

Before going live, confirm:

- [ ] **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` set and correct for production project.
- [ ] **Cron:** Either `CRON_SECRET` or `CRON_SECRET_HASH` set; prefer hash in production. Vercel Cron (or external scheduler) sends Bearer token on every cron request.
- [ ] **Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and any price IDs used by the app (e.g. `STRIPE_PRICE_*`) set. Webhook endpoint configured in Stripe dashboard with the same secret.
- [ ] **Optional but recommended:** `NEXT_PUBLIC_APP_URL` (no trailing slash), `SENTRY_DSN` for error tracking, `RESEND_*` for transactional email, Redis (Upstash) for auth profile cache if used in production.
- [ ] **Never in production:** Do not set `SEED_DEMO_PASSWORD` / `SEED_DEMO_SECRET` in production; do not enable debug routes or test-login.

---

## 6. Summary of actions

| Priority        | Action                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Done**        | Fix agency pipeline type (JobPosting vs title) so production build passes.                                                      |
| **Blocking**    | Ensure production env has required Supabase + cron secret (or hash); Stripe webhook secret if using billing.                    |
| **High**        | Run full test suite in CI; fix `test:unit` or path so all intended tests run. Prefer CRON_SECRET_HASH in production.            |
| **Recommended** | Add deploy-time or CI check for critical env vars. Keep ADMIN_CLIENT_AUDIT.md updated. Run k6/Playwright before major releases. |

---

_Audit performed by static review of auth, API routes, middleware/proxy, config, error handling, and tests, plus a successful production build and typecheck._
