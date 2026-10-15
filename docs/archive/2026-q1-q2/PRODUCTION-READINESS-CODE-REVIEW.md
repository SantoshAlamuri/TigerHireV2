# TigerHire — Production Readiness Code Review

**Date:** 2025-03-07  
**Scope:** Full codebase review against Security, Database, Performance, Error Handling, Code Quality, Scalability, Testing, Deployment, and Documentation.

---

## Summary

| Severity        | Count          |
| --------------- | -------------- |
| Critical Issues | 2              |
| High Priority   | 8              |
| Medium Priority | 12             |
| Low Priority    | 6              |
| **Overall**     | **NEEDS WORK** |

Address the **Critical** and **High** items before production deployment. The codebase has solid foundations (auth, RBAC, rate limiting, RLS, env validation, health checks, OpenAPI) but has specific gaps that should be fixed or documented.

---

## How to Take It to 95/100

To move from **68 → 95** (production-ready with only minor gaps), work through this checklist in order. Each phase is roughly +7–9 points.

### Phase 1: Critical (must complete) — **68 → 78**

- [ ] **C1.** Agency upload rate limit: fail closed in `upload-profile/route.ts` and `upload-profile/bulk/route.ts` (see code fix in Critical §1).
- [ ] **C2.** Dependency audit: fix or accept high/critical npm advisories (downgrade/remove PWA or patch deps); add `npm audit --audit-level=high` to CI and fail on high/critical.

### Phase 2: High priority — **78 → 86**

- [ ] **H1.** Apply route: validate uploaded file type by content (magic bytes), not only `file.type`.
- [ ] **H2.** Health route: log errors in readiness catch (e.g. `reportError`) before returning 503.
- [ ] **H3.** Dashboard error boundary: in production, show generic message; only expose `error.message` in development.
- [ ] **H4.** Apify: send token in header (e.g. `Authorization: Bearer`) if API supports it; avoid token in URL.
- [ ] **H5.** OpenAPI route: log in catch when spec file is missing (e.g. `reportError`).
- [ ] **H6.** Waitlist count: add rate limiting (e.g. by IP) or short cache (e.g. 60s).
- [ ] **H7.** Apply `[slug]` GET: add rate limiting (and optional cache) for public job listing.
- [ ] **H8.** Signals ingest: batch select + batch insert (or RPC) to remove N+1.

### Phase 3: Medium priority (most of them) — **86 → 93**

- [ ] **M1.** API routes: in JSON-parse catch blocks, log then return 400 (e.g. `reportError` + jsonError).
- [ ] **M2.** `log-auth-error` route: log in catch before returning 204.
- [ ] **M3.** Redis cache: log (warn/debug) on set/del failure instead of failing silently.
- [ ] **M4.** Document CORS stance (same-origin only or allowlist); no wildcard in production.
- [ ] **M5.** Add a minimal Dockerfile (multi-stage, non-root, no secrets in layers) if you deploy via containers.
- [ ] **M6.** Document which flows use DB transactions; add RPC/transaction where atomicity is required.
- [ ] **M7.** Cron routes: add test or script that ensures every `/api/cron/*` uses `validateCronSecret`.
- [ ] **M8.** Health dependency checks: log at debug when Stripe/Anthropic/WhatsApp check fails.
- [ ] **M9.** Split very long dashboard pages (e.g. recruit pipeline, agency pipeline) into smaller components/hooks.
- [ ] **M10.** Add Zod (or similar) for all POST body shapes that currently use ad-hoc `body?.x`.
- [ ] **M11.** Production: use `CRON_SECRET_HASH` only; document in runbooks.
- [ ] **M12.** Integration test: recruiter sees only applications for their org’s jobs (RLS verification).

### Phase 4: Polish — **93 → 95**

- [ ] **L1.** Orchestrator route: return 400 when body is missing/invalid instead of defaulting to `{}` if body is required.
- [ ] **L2.** README: env vars, migrations, test commands, and link to OpenAPI.
- [ ] **L3.** Optional: short TTL cache for hot read endpoints (e.g. candidate/applications list) where consistent.
- [ ] **L4.** Standardise logging context (e.g. `route`, `userId`, `requestId`) across API routes.
- [ ] **L5.** Consider route/feature-level error boundaries for critical flows (apply, checkout).
- [ ] **L6.** CI: add coverage threshold (e.g. 70%) and fail build if below.

**Summary:** Complete Phase 1 + 2 to reach **~86**; add most of Phase 3 to reach **~93**; finish with Phase 4 to land at **95**.

---

## Critical Issues (MUST FIX)

### 1. [src/app/api/agency/upload-profile/route.ts:50-52] and [src/app/api/agency/upload-profile/bulk/route.ts:57-61] — Rate limit failure allows request (fail-open)

If the rate limit check throws (e.g. missing RPC or `rate_limit_log` table), the code catches and allows the request. This weakens abuse protection.

**Fix:** Reject the request when rate limit cannot be evaluated, or use a strict fallback (e.g. allow 0 and return 429).

```ts
// Current (fail-open):
try {
  const rl = await checkRateLimit({
    key: `agency-upload:${ctx.userId}`,
    limit: 30,
    windowSecs: 60,
  });
  rlAllowed = rl.allowed;
} catch {
  // If rate limit check fails (e.g. missing RPC/table), allow the request
}

// Recommended (fail-closed):
let rlAllowed = false;
try {
  const rl = await checkRateLimit({
    key: `agency-upload:${ctx.userId}`,
    limit: 30,
    windowSecs: 60,
  });
  rlAllowed = rl.allowed;
} catch (err) {
  reportError(err, { route: "POST /api/agency/upload-profile" });
  return jsonError("Rate limit check unavailable. Please try again later.", 503);
}
if (!rlAllowed) return jsonError("Too many uploads. Please wait a moment.", 429);
```

---

### 2. [package.json / npm audit] — High-severity dependency vulnerabilities

`npm audit` reports **5 high** vulnerabilities: `@ducanh2912/next-pwa` (and transitive `workbox-build`, `serialize-javascript`, etc.). One advisory is **GHSA-5c6j-r48x-rmvq** (Serialize JavaScript RCE via RegExp.flags).

**Fix:**

- Run `npm audit` and apply fixes (e.g. downgrade `@ducanh2912/next-pwa` to 10.2.6 if compatible, or wait for a patched release).
- Re-run `npm audit` in CI and fail the build on high/critical vulnerabilities.
- If PWA is not required for launch, consider disabling or removing it until dependencies are patched.

---

## High Priority

### 1. [src/app/api/apply/route.ts:67] — File type validation relies on client-controlled `file.type`

Validation uses only `file.type` and `ALLOWED_TYPES.includes(file.type)`. Client can send a different MIME and bypass the check.

**Recommendation:** Validate by content (magic bytes) as in agency upload, e.g. use `inferMimeFromName` plus a small header read or an existing utility (e.g. `src/lib/services/extract-document-text.ts` or a dedicated magic-number check) and reject if not PDF/DOC/DOCX.

---

### 2. [src/app/api/health/route.ts:44-48] — Bare catch swallows DB errors without logging

The readiness block catches any error and returns 503 without logging, making DB outages hard to diagnose.

**Recommendation:** Log before returning 503:

```ts
} catch (err) {
  reportError(err, { route: "GET /api/health", ready: true });
  return NextResponse.json(
    { ok: false, error: "db_unavailable" },
    { status: 503 },
  );
}
```

---

### 3. [src/app/(dashboard)/error.tsx:26] — Error boundary exposes `error.message` to client

Dashboard error boundary renders `error.message` to the user. In production, internal messages can leak (paths, table names, etc.).

**Recommendation:** In production, show a generic message (e.g. "Something went wrong") and only pass `error.message` to `reportError()` or Sentry; keep detailed message for development only (e.g. `process.env.NODE_ENV === "development"`).

---

### 4. [src/lib/services/apify.ts:33,56] — API token in URL query string

Apify token is passed as `?token=...` in the URL. URLs may be logged by proxies, load balancers, or error logs.

**Recommendation:** Prefer `Authorization: Bearer <token>` (or Apify’s recommended header) if the API supports it, to avoid token in logs.

---

### 5. [src/app/api/openapi/route.ts:10-11] — Path from `process.cwd()` and bare catch

Uses `path.join(process.cwd(), "docs", "openapi.yaml")`. If `cwd` is wrong or file is missing, the catch returns 404 without logging.

**Recommendation:** Use a path relative to the app root (e.g. `path.join(process.cwd(), "docs", "openapi.yaml")` is fine for Vercel; ensure `docs/openapi.yaml` is included in the deployment). Add `reportError(err, { route: "GET /api/openapi" })` in the catch so missing-file or path issues are visible.

---

### 6. [src/app/api/waitlist/count/route.ts] — No rate limiting

GET returns waitlist count (plus optional SEED). Unauthenticated and unthrottled; could be scraped or used to probe size.

**Recommendation:** Add rate limiting (e.g. `checkRateLimit` with a key like `waitlist-count:ip` and a low limit) or cache the response briefly (e.g. 60s) to reduce scrape impact.

---

### 7. [src/app/api/apply/[slug]/route.ts] — GET uses admin client and has no rate limit

Public GET returns organisation and open jobs by slug using `createSupabaseAdmin()`. No rate limit; could be scraped or abused.

**Recommendation:** Add rate limiting by IP (or by slug) and optionally cache responses (e.g. 1–5 minutes) for hot slugs.

---

### 8. [src/app/api/signals/ingest/route.ts:66-74] — N+1 in batch insert

Loop over `parsed.data.signals` does a select-then-insert per signal. For 500 signals this is 1000 round-trips.

**Recommendation:** Batch: e.g. one query to fetch existing `(source, external_id)` for all signals (e.g. `in` filter or temp table), then a single insert of new rows (or use an RPC that does upsert/dedupe in DB).

---

## Medium Priority

### 1. [Multiple API routes] — JSON parse catch returns 400 without logging

Many routes use `try { body = await request.json(); } catch { return jsonError("Invalid JSON body", 400); }`. Invalid JSON could indicate client bugs or attacks; no server-side visibility.

**Recommendation:** In catch, call `reportError(err, { route: "…" })` (or logger) with the error, then return 400.

---

### 2. [src/app/api/auth/log-auth-error/route.ts:22-23] — Catch swallows all errors

Any error in the handler results in 204 with no logging.

**Recommendation:** At least log: `reportError(err, { route: "/api/auth/log-auth-error" })` before returning 204.

---

### 3. [src/lib/redis/cache.ts:81-82, 95-96] — Cache set/del fail silently

Cache write/delete errors are caught and ignored. Operational issues (e.g. Redis down) will be invisible.

**Recommendation:** Log at debug/warn level (e.g. `logger.warn("Cache set failed", { key, error })`) so that cache dependency issues can be detected.

---

### 4. [Next.js config] — No explicit CORS for API routes

No `Access-Control-*` headers are set in the app. Same-origin is default; if you add cross-origin API consumers, CORS must be configured explicitly (and not with `*` in production).

**Recommendation:** Document that API is same-origin only; when adding CORS, use an allowlist of origins and avoid wildcard in production.

---

### 5. [Deployment] — No Dockerfile in repo

No Dockerfile found. For container-based deployment (e.g. Kubernetes, ECS), image build is undefined.

**Recommendation:** Add a minimal, multi-stage Dockerfile (e.g. Node 20, `next build`, `next start`) and document; run as non-root and do not bake secrets into layers.

---

### 6. [Database] — Transaction usage

Multi-step flows (e.g. Stripe webhook handler, agency upload) use multiple sequential Supabase calls. Some use RPCs (e.g. `stripe_event_try_acquire`, `stripe_checkout_company`) which can encapsulate transactions; others do not.

**Recommendation:** For any flow that must be atomic (e.g. create candidate + application + fit_score), use a single RPC or `executeTransaction` with a fallback that preserves consistency; document which routes rely on DB transactions.

---

### 7. [src/app/api/cron/*] — Cron auth

All reviewed cron routes call `validateCronSecret(request)`. Ensure no new cron route is added without this check (e.g. checklist or test that asserts cron routes require the secret).

**Recommendation:** Add a test or script that greps for `api/cron/` route files and asserts each imports and uses `validateCronSecret`.

---

### 8. [Error handling] — Health check dependency failures

In `checkStripe`, `checkAnthropic`, `checkWhatsApp`, errors are caught and return `false` with no logging. For readiness/debugging, consider logging at debug level (e.g. “Stripe health check failed”, no sensitive data).

---

### 9. [Code quality] — Long files

Examples: `src/app/(dashboard)/recruit/pipeline/page.tsx`, `src/app/(dashboard)/agency/pipeline/page.tsx` are very long (600+ lines). Hard to maintain and test.

**Recommendation:** Extract hooks, subcomponents, and pure functions (e.g. mapping, grouping) into smaller modules.

---

### 10. [Input validation] — Some POST bodies use ad-hoc parsing

E.g. `body?.candidateId`, `body?.slot_id`, `body?.stages` without Zod (or similar) on the full body. Typo or wrong type can cause subtle bugs.

**Recommendation:** Define Zod (or other) schemas for request bodies and use `safeParse`; return 422 with validation errors.

---

### 11. [Secrets] — CRON_SECRET in production

`envServerSchema` allows either `CRON_SECRET` or `CRON_SECRET_HASH`. Raw `CRON_SECRET` can appear in env and logs.

**Recommendation:** Prefer `CRON_SECRET_HASH` in production and document in runbooks; ensure cron callers send the same secret that was hashed.

---

### 12. [Testing] — Application list scoping

`ApplicationRepository.listForRecruiter` does not explicitly filter by `organisation_id` in the query; RLS (“Org members can read applications for their jobs”) enforces scope. This is correct but subtle.

**Recommendation:** Add an integration test that asserts a recruiter only receives applications for jobs in their organisation (and not other orgs).

---

## Database transactions

Flows that rely on multi-step DB consistency: **Stripe webhook** (RPCs `stripe_event_try_acquire`, `stripe_checkout_company` / `stripe_checkout_candidate`, subscription updates); **agency upload** (candidate + application + fit_score in sequence; consider RPC if atomicity is required); **signals ingest** (batch upsert with `onConflict`). Add RPC/transaction where a flow must be atomic.

---

## Low Priority

### 1. [src/app/api/jobs/[id]/orchestrator/route.ts:67-71] — Empty body default

`body = await request.json()` in try/catch; on failure `body = {}`. If the route expects required fields, missing body may lead to a later error instead of 400.

**Recommendation:** For routes that require a body, return 400 when JSON is invalid or body is empty, with a clear message.

---

### 2. [Documentation] — README and setup

Ensure README (or docs) includes: env vars (e.g. from `.env.example`), how to run migrations, and how to run tests. `docs/openapi.yaml` exists and is served at `/api/openapi`; document that in README or API docs.

---

### 3. [Performance] — Caching

Jobs list and auth profile are cached (Redis). Other hot read endpoints (e.g. candidate list, applications list) could be considered for short TTL cache where consistency allows.

---

### 4. [Logging] — Structured context

Many `reportError`/logger calls include `route` and `userId`. Standardise a small set of fields (e.g. `route`, `userId`, `requestId`) across API routes for easier querying and tracing.

---

### 5. [Frontend] — Error boundaries

Global and dashboard error boundaries exist. Consider route-level or feature-level boundaries for critical flows (e.g. apply, checkout) so one failing component does not take down the whole page.

---

### 6. [CI] — Coverage gate

CI runs `test:coverage`. Consider enforcing a minimum coverage threshold (e.g. 70% for critical paths) and failing the build if below.

---

## Code Examples for Critical Fixes

### Critical 1: Rate limit fail-closed (agency upload)

```ts
// In src/app/api/agency/upload-profile/route.ts (and bulk/route.ts), replace:

let rlAllowed = true;
try {
  const rl = await checkRateLimit({
    key: `agency-upload:${ctx.userId}`,
    limit: 30,
    windowSecs: 60,
  });
  rlAllowed = rl.allowed;
} catch {
  // If rate limit check fails (e.g. missing RPC/table), allow the request
}
if (!rlAllowed) return jsonError("Too many uploads. Please wait a moment.", 429);

// With:

let rlAllowed = false;
try {
  const rl = await checkRateLimit({
    key: `agency-upload:${ctx.userId}`,
    limit: 30,
    windowSecs: 60,
  });
  rlAllowed = rl.allowed;
} catch (err) {
  reportError(err, { route: "POST /api/agency/upload-profile", userId: ctx.userId });
  return jsonError("Rate limit check unavailable. Please try again later.", 503);
}
if (!rlAllowed) return jsonError("Too many uploads. Please wait a moment.", 429);
```

### Critical 2: Dependency vulnerabilities

- Run: `npm audit`
- Apply: `npm audit fix` or manually upgrade/downgrade as needed (e.g. `@ducanh2912/next-pwa@10.2.6` if compatible).
- In CI (e.g. `.github/workflows/ci.yml`): add a step that runs `npm audit --audit-level=high` and fails the job on high/critical.

---

## What’s in Good Shape

- **Security:** Auth via Supabase; RBAC and role-based routing; cron routes protected with `validateCronSecret`; CSRF via `validateOrigin` in production; Stripe webhook signature verification; no hardcoded secrets (env via `@/lib/config/env.ts`); auth errors sanitised with `toUserFacingAuthError`; security headers (HSTS, X-Frame-Options, etc.) and CSP in proxy.
- **Database:** Supabase client uses parameterized queries (no raw SQL concatenation); RLS on applications and other tables; indexes on key columns; rate limit uses RPC or table.
- **Performance:** Pagination and limits on list endpoints; Redis caching for jobs and auth profile; health checks with timeouts.
- **Error handling:** Global and dashboard error boundaries; `handleApiError` and `reportError` used in many routes; health endpoint returns 503 when DB is down.
- **API design:** `getAuthContext`, `requireAuth`, `hasRole` used consistently; Zod validation on many routes; OpenAPI spec at `docs/openapi.yaml` and served at `/api/openapi`.
- **Testing:** Unit and functional tests for health, auth, rate limit, and other features; Playwright e2e; k6 load scripts.
- **Observability:** Correlation IDs, route spans, Sentry integration, structured logging.

---

## Verdict

**NEEDS WORK** before production: fix the two critical issues (rate limit fail-open on agency upload, dependency vulnerabilities), then address the high-priority items (file type validation, health/error logging, error boundary message exposure, Apify token in URL, waitlist/apply rate limiting, signals ingest N+1). After that, the codebase is in a good position for a controlled production rollout, with medium/low items handled as follow-ups.
