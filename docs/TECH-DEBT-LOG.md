# Tech Debt Log — Prioritized Backlog

Aligned with **Elite Engineering Standard v1.0** and [PRODUCTION-READINESS-CODE-REVIEW.md](./archive/2026-q1-q2/PRODUCTION-READINESS-CODE-REVIEW.md). Every item should have a ticket (e.g. GitHub Issue) for repayment where applicable.

---

## Priority 1 — Blocking / Critical (Must fix before production)

| ID  | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Source                   | Ticket |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------ |
| T1  | ✅ **DONE (2026-05-12)** — Agency upload rate limit is fail-closed in both `upload-profile/route.ts` and `upload-profile/bulk/route.ts`: when `checkRateLimit` throws, the catch calls `reportError` and returns HTTP 503. Verified during pre-beta tech-debt sweep.                                                                                                                                                                                       | Code Review § Critical 1 | —      |
| T2  | ✅ **DONE (2026-05-12)** — Ran `npm audit fix` to patch 6 HIGH Next.js CVEs (cache poisoning, middleware/proxy bypass, SSRF, CSP-nonce XSS, RSC cache poisoning, Image Optimization DoS). Next bumped from 16.2.4 → 16.2.6. `npm audit --audit-level=high` is now clean. Remaining moderate is `@anthropic-ai/sdk` Local Filesystem Memory Tool — not used by this codebase. Follow-up: add `npm audit --audit-level=high` as a CI gate (separate ticket). | Code Review § Critical 2 | —      |

---

## Priority 2 — High (Address before or shortly after launch)

| ID  | Item                                                                                                                                                                                                                                                                                                                                                                       | Source               | Ticket |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------ |
| T3  | ✅ **DONE (2026-05-12)** — Apply route validates by content. `src/app/api/apply/route.ts` reads the buffer and calls `detectMimeFromBuffer(buffer, file.name)` (magic-byte based) before any downstream processing. Verified during pre-beta tech-debt sweep.                                                                                                              | Code Review § High 1 | —      |
| T4  | ✅ **DONE (2026-05-12)** — `src/app/api/health/route.ts` catches the DB probe error and calls `reportError(err, { route: "GET /api/health", ready: true })` before returning 503. Verified during pre-beta tech-debt sweep.                                                                                                                                                | Code Review § High 2 | —      |
| T5  | ✅ **DONE (2026-05-12)** — Both error boundaries hide `error.message` in production: `src/app/(dashboard)/error.tsx` and `src/app/(public)/apply/error.tsx` switch on `process.env.NODE_ENV === "development"` and show a generic "Something went wrong" message otherwise. Verified during pre-beta tech-debt sweep.                                                      | Code Review § High 3 | —      |
| T6  | ✅ **DONE (2026-05-12)** — `src/lib/services/apify.ts` sends the token via `Authorization: Bearer ${env.apifyApiToken}` header, not in the URL query string. Verified during pre-beta tech-debt sweep.                                                                                                                                                                     | Code Review § High 4 | —      |
| T7  | ✅ **DONE (2026-05-12)** — `src/app/api/openapi/route.ts` catches read failures and calls `reportError(err, { route: "GET /api/openapi" })` before returning 404. Verified during pre-beta tech-debt sweep.                                                                                                                                                                | Code Review § High 5 | —      |
| T8  | ✅ **DONE (2026-05-12)** — `src/app/api/waitlist/count/route.ts` calls `checkRateLimit` on every GET. Scraping impact bounded by the rate limit; an explicit cache layer remains optional (not blocking). Verified during pre-beta tech-debt sweep.                                                                                                                        | Code Review § High 6 | —      |
| T9  | ✅ **DONE (2026-05-12)** — `src/app/api/apply/[slug]/route.ts` enforces `checkRateLimit` (60/min per IP) before any DB lookup. Burst-tested in `scripts/launch-readiness-auto.mjs` "Apply slug GET rate-limit sweep" check; 70 parallel requests against an invalid slug yield 429s mixed with 404s and zero 5xx. Optional cache for hot slugs remains a future micro-opt. | Code Review § High 7 | —      |
| T10 | **Signals ingest: batch select + batch insert** — Remove N+1; one query for existing (source, external_id), then single insert for new rows (or RPC).                                                                                                                                                                                                                      | Code Review § High 8 | —      |

---

## Priority 3 — Medium (Next sprint or when touching area)

| ID  | Item                                                                                                                                                                                                                                                                                                                       | Source            | Ticket |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------ |
| T11 | 🟡 **Partial (2026-05-12)** — `src/lib/api-helpers.ts` exports `parseJsonBody` that wraps parse+report+400; new and refactored routes use it. Older routes that hand-roll JSON parsing don't all log to `reportError` before returning 400. Pattern is not universally enforced yet. Survey + sweep is the remaining work. | Code Review § M1  | —      |
| T12 | ✅ **DONE (2026-05-12)** — `src/app/api/auth/log-auth-error/route.ts` catches errors and calls `reportError(err, { route: "/api/auth/log-auth-error" })` before returning 204. Verified during pre-beta tech-debt sweep.                                                                                                   | Code Review § M2  | —      |
| T13 | ✅ **DONE (2026-05-12)** — `src/lib/redis/cache.ts` logs via `logger.warn(...)` AND `captureSentryMessage(...)` on `cacheSet`, `cacheDel`, and `cacheDelByPattern` failures. No silent failures. Verified during pre-beta tech-debt sweep.                                                                                 | Code Review § M3  | —      |
| T14 | ✅ **DONE (2026-05-12)** — CORS stance is documented in `docs/PRODUCTION-READINESS-CODE-REVIEW.md`, `docs/API.md`, and `docs/ENTERPRISE_CODE_QUALITY_AUDIT.md` (same-origin only). Verified during pre-beta tech-debt sweep.                                                                                               | Code Review § M4  | —      |
| T15 | ✅ **DONE (2026-05-12)** — `Dockerfile` exists at repo root. (Production deploy is Vercel, not containers, so this is reference only.) Verified during pre-beta tech-debt sweep.                                                                                                                                           | Code Review § M5  | —      |
| T16 | ✅ **DONE (2026-05-12)** — Transaction usage documented in `docs/ARCHITECTURE-C4.md`, `docs/PRODUCTION-READINESS-CODE-REVIEW.md`, `docs/TRACK_2_THIRD_PARTY.md`, and `docs/ELITE-PERFORMANCE-REPORT.md`. Verified during pre-beta tech-debt sweep.                                                                         | Code Review § M6  | —      |
| T17 | ✅ **DONE (2026-05-12)** — `tests/unit/cron-secret-coverage.test.ts` walks every `route.ts` under `src/app/api/cron/` and asserts `validateCronSecret(` is invoked. Runs in CI. All 17 current cron routes pass. Added during pre-beta tech-debt sweep.                                                                    | Code Review § M7  | —      |
| T18 | ✅ **DONE (2026-05-12)** — `checkStripe`, `checkAnthropic`, `checkWhatsApp` in `src/app/api/health/route.ts` each call `logger.debug("X health check failed")` on failure. Verified during pre-beta tech-debt sweep.                                                                                                       | Code Review § M8  | —      |
| T19 | 🔴 **Open** — Five dashboard pages remain >1000 lines (2026-05-12): `agency/pipeline/page.tsx` (1280), `admin/onboarding-requests/page.tsx` (1202), `recruit/interview-prep/page.tsx` (1147), `recruit/pipeline/page.tsx` (1092), `candidate/profile/page.tsx` (1075). Real refactor needed; not beta-blocking.            | Code Review § M9  | —      |
| T20 | **Zod for all POST bodies** — Replace ad-hoc `body?.x` with Zod (or similar) and return 422 on validation errors.                                                                                                                                                                                                          | Code Review § M10 | —      |
| T21 | ✅ **DONE (2026-05-12)** — `CRON_SECRET_HASH` is referenced and documented in cron route comments (`/api/cron/embed/route.ts`, `/api/cron/interview-reminders/route.ts`, etc.) as the preferred prod auth method. Verified during pre-beta tech-debt sweep.                                                                | Code Review § M11 | —      |
| T22 | ✅ **DONE (2026-05-12)** — `tests/integration/applications-rls.test.ts` ("Applications RLS — recruiter sees only their org's applications") + `tests/integration/multi-tenant-isolation.test.ts` cover this. Verified during pre-beta tech-debt sweep.                                                                     | Code Review § M12 | —      |

---

## Priority 4 — Low / Polish (Backlog)

| ID  | Item                                                                                                                              | Source           | Ticket |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------ |
| T23 | **Orchestrator route: 400 on invalid body** — When body required, return 400 if missing/invalid instead of defaulting to `{}`.    | Code Review § L1 | —      |
| T24 | **README: env, migrations, test, OpenAPI link** — Ensure README has env vars, migration commands, test commands, link to OpenAPI. | Code Review § L2 | —      |
| T25 | **Short TTL cache for hot reads** — Candidate/applications list where consistency allows.                                         | Code Review § L3 | —      |
| T26 | **Structured logging context** — Standardise `route`, `userId`, `requestId` across API routes.                                    | Code Review § L4 | —      |
| T27 | **Route/feature error boundaries** — Consider for apply, checkout.                                                                | Code Review § L5 | —      |
| T28 | **CI coverage threshold** — Already 70% in Vitest; consider raising or documenting.                                               | Code Review § L6 | —      |

---

## Elite Standard — Additional tech debt

| ID  | Item                                                                                                                         | Standard area | Ticket |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| T29 | **Lighthouse in CI** — Add Lighthouse CI or Vercel Speed Insights; fail on performance &lt;90.                               | Performance   | —      |
| T30 | **Bundle size budget** — Record baseline with `ANALYZE=true npm run build`; add CI gate (e.g. fail if initial JS &gt;250KB). | Performance   | —      |
| T31 | **JSDoc for public APIs** — Add JSDoc to all public APIs in `src/lib/` and route helpers.                                    | Code quality  | —      |
| T32 | **Sequence diagrams** — Add for apply flow, Stripe webhook, fit-score pipeline.                                              | Documentation | —      |
| T33 | **No `any`** — Audit and remove remaining `any`; strict TypeScript.                                                          | Type safety   | —      |

---

## Summary

| Priority     | Count | Goal                                   |
| ------------ | ----- | -------------------------------------- |
| P1 Critical  | 2     | Fix before any production deploy       |
| P2 High      | 8     | Fix before or immediately after launch |
| P3 Medium    | 12    | Plan in next sprints                   |
| P4 Low       | 6     | Backlog when capacity allows           |
| Elite extras | 5     | Align with 90+ targets over time       |

### Status as of 2026-05-12 (post pre-beta re-audit)

After re-auditing T1–T22 against actual code (the log had drifted, e.g. T1/T3/T5 were marked open but were already fixed):

| Bucket     | IDs                                                                                                             | Count |
| ---------- | --------------------------------------------------------------------------------------------------------------- | ----- |
| ✅ Done    | T1, T2, T3, T4, T5, T6, T7, T8, T9, T12, T13, T14, T15, T16, T17, T18, T21, T22                                 | 18    |
| 🟡 Partial | T11 (`reportError` on JSON parse — pattern exists but not universally enforced across older routes)             | 1     |
| 🔴 Open    | T10 (signals ingest N+1), T19 (5 dashboard pages > 1000 lines), T20 (Zod for POST bodies — unverified at scale) | 3     |

**P1 is 100% closed.** P2 is 7-of-8 closed (T10 remaining). P3 is 9-of-12 closed (T11 partial, T19/T20 open). None of the remaining items are beta-blocking; T19 and T20 are scheduled-refactor work that should be planned for a quieter sprint.

**Golden rule:** No tech debt without a tracked ticket for repayment. Link tickets in the **Ticket** column as they are created.
