# PRODUCTION READINESS & ENTERPRISE EXCELLENCE AUDIT

## TigerHire — Comprehensive Multi-Dimensional Codebase Assessment

**Audit Date**: February 22, 2026  
**Re-Audit Date**: February 22, 2026 (post–Platform Readiness Roadmap)  
**FitScore hardening addendum**: May 19, 2026 (scoring guards, metrics, ledger — see Section 12)  
**Auditor**: Staff+ Engineer / Principal Architect Review  
**Codebase**: TigerHire (Next.js 16 + Supabase + AI Agents)  
**Stack**: TypeScript, React 19, Next.js 16.1.6, Supabase (PostgreSQL + Auth), Anthropic Claude, OpenAI, Stripe, Vercel  
**Scale Target**: 10M+ users, 99.99% uptime SLA

---

## EXECUTIVE SUMMARY

### Scoring Methodology

Scores are calibrated on a 0–100 scale where 70 = "typical production SaaS app" and 90+ = "exceeds enterprise standards." This re-audit reflects the **post–roadmap** state after implementing Phase 1–2 hardening (security, reliability, observability, performance, quality, circuit breakers, DLQ, cursor pagination, OpenAPI, migrations).

| Dimension                   | V1 (pre) | V2 (pre-roadmap) | V3 (post-roadmap) | Grade | Weight | Weighted |
| --------------------------- | -------- | ---------------- | ----------------- | ----- | ------ | -------- |
| **Security**                | 72       | 70               | **85**            | B     | 25%    | 21.25    |
| **Reliability**             | 58       | 60               | **78**            | C+    | 20%    | 15.6     |
| **Performance**             | 68       | 65               | **76**            | C+    | 15%    | 11.4     |
| **Code Quality**            | 74       | 76               | **82**            | B     | 15%    | 12.3     |
| **Test Coverage**           | 48       | 46               | **52**            | F     | 10%    | 5.2      |
| **Observability**           | 62       | 62               | **76**            | C+    | 10%    | 7.6      |
| **Speed / Maintainability** | 64       | 66               | **78**            | C+    | 5%     | 3.9      |
| **OVERALL**                 | **65.1** | **64.75**        | **77.25**         | **B** | 100%   | —        |

### Production Readiness: **YES (controlled launch)**

The codebase is **production-ready for a controlled launch** (single region, moderate traffic up to ~50K users). Critical security, reliability, and observability gaps from the previous audit have been addressed. Remaining work is primarily **test coverage**, **Redis/queue adoption**, and **enterprise-scale** items (multi-region, SOC 2, load testing).

### Critical Blockers (P0) — Resolved

| #   | Former Blocker                           | Status                                                                                                                                                                               |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Low test coverage**                    | **OPEN** — Coverage thresholds and CI coverage run exist; coverage remains ~5–10%. Add tests for critical paths to reach 70%+ (Phase 1 target).                                      |
| 2   | **No database transactions**             | **FIXED** — Stripe webhook uses `stripe_event_try_acquire` + RPCs (`stripe_checkout_company`, `stripe_checkout_candidate`); registration uses `register_create_org_and_profile` RPC. |
| 3   | **Missing CSP/HSTS; hardcoded password** | **FIXED** — CSP and HSTS in `next.config.ts`; no client-side test password; seed-demo requires `SEED_DEMO_PASSWORD` (server-only); test-login is dev-only API.                       |

### High Priority (P1) — Status

| #   | Issue                                    | Status                                                                                                                                  |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 4   | **Timeouts on external API calls**       | **FIXED** — Anthropic 30s, OpenAI 30s, WhatsApp 10s; retry wrapper with backoff.                                                        |
| 5   | **Stripe webhook idempotency**           | **FIXED** — `stripe_events` table + `stripe_event_try_acquire` RPC.                                                                     |
| 6   | **Sentry unused**                        | **FIXED** — `reportError()` calls Sentry in login, register, Stripe webhook catch blocks.                                               |
| 7   | **PII redaction in logs**                | **FIXED** — Logger redacts email and phone patterns in production.                                                                      |
| 8   | **CSRF protection**                      | **FIXED** — `validateOrigin()` on login and register; SameSite=Strict on auth cookies.                                                  |
| 9   | **RBAC org validation**                  | **FIXED** — `requireRole(..., resourceOrganisationId)` enforces org for non–super_admin.                                                |
| 10  | **Circuit breakers**                     | **FIXED** — Circuit breakers on Anthropic, OpenAI, WhatsApp.                                                                            |
| 11  | **DLQ for fire-and-forget**              | **FIXED** — `failed_operations` table; scout and contact route write failures via `appendToDlq`.                                        |
| 12  | **N+1 in embeddings / shortlist**        | **FIXED** — Batch embeddings with `Promise.allSettled` chunks; shortlist uses `createNotificationBatch`.                                |
| 13  | **Cursor pagination**                    | **FIXED** — Candidates, jobs, applications support `cursor` / `nextCursor`.                                                             |
| 14  | **.env.example, enum drift, CI, Docker** | **FIXED** — `.env.example`; `src/types/database.ts` single source for roles; parallel CI (lint, typecheck, test); `docker-compose.yml`. |
| 15  | **OpenAPI / migrations**                 | **FIXED** — `docs/openapi.yaml`; `docs/MIGRATIONS.md`; ADRs and SLOs documented.                                                        |

### Risk Assessment (updated)

| Risk Type        | Level  | Description                                                                             |
| ---------------- | ------ | --------------------------------------------------------------------------------------- |
| **Security**     | LOW    | Credentials and headers addressed; CSRF and RBAC org checks in place.                   |
| **Financial**    | LOW    | Stripe idempotency and atomic RPCs prevent duplicate processing.                        |
| **Reputational** | LOW    | PII redaction in logs; GDPR utilities present.                                          |
| **Operational**  | MEDIUM | Sentry and Slack wired; correlation IDs and health deps exist; test coverage still low. |

### Timeline to Enterprise-Ready (10M+ / 99.99%): **8–12 weeks** (test coverage, Redis, job queue, OpenTelemetry, load testing)

---

## SECTION 1: VELOCITY & SPEED OPTIMIZATION — Score: 78/100 (C+)

### 1.1 Build & Deployment Speed

| Item                    | Status      | Finding                                                                         |
| ----------------------- | ----------- | ------------------------------------------------------------------------------- |
| CI/CD Pipeline          | ✅ IMPROVED | Lint, typecheck, and test run in **parallel** jobs; build depends on all three. |
| Incremental Builds      | ✅ PASS     | Next.js Turbopack in dev; Vercel production deploys.                            |
| Parallel Execution      | ✅ FIXED    | Three parallel jobs (lint, typecheck, test).                                    |
| Artifact Optimization   | ⚠️ PARTIAL  | Docker Compose for local DB; no app Dockerfile.                                 |
| Dependency Installation | ✅ PASS     | `npm ci` with lockfile; npm cache.                                              |
| Deployment Velocity     | ✅ PASS     | Vercel auto-deploy; preview on PR.                                              |

### 1.2 Development Velocity

| Item             | Status      | Finding                                                             |
| ---------------- | ----------- | ------------------------------------------------------------------- |
| Hot Reload       | ✅ PASS     | Turbopack dev server.                                               |
| Test Execution   | ⚠️ PARTIAL  | Vitest with coverage thresholds; 60 tests; coverage still low.      |
| Local Setup      | ✅ IMPROVED | `.env.example`; Docker Compose for Postgres; documented migrations. |
| Mock Services    | ❌ FAIL     | No full mock server for Supabase/Stripe in dev.                     |
| Pre-commit Hooks | ✅ PASS     | Husky + lint-staged (Prettier + ESLint).                            |

### 1.3 Runtime Speed

| Item               | Status      | Finding                                                   |
| ------------------ | ----------- | --------------------------------------------------------- |
| Cold Start         | ⚠️ PARTIAL  | Serverless; not measured.                                 |
| Frontend Bundle    | ⚠️ PARTIAL  | No size targets.                                          |
| Code Splitting     | ✅ IMPROVED | `next/dynamic` for FitScoreCardMock and AdminUsersTable.  |
| Image Optimization | ⚠️ PARTIAL  | No `next/image` usage (no image assets in current pages). |
| CDN / Caching      | ⚠️ PARTIAL  | Dashboard `force-dynamic`; no ISR for public content.     |

---

## SECTION 2: RELIABILITY & RESILIENCE — Score: 78/100 (C+)

### 2.1 Fault Isolation

| Item                 | Status     | Finding                                                                   |
| -------------------- | ---------- | ------------------------------------------------------------------------- |
| Circuit Breakers     | ✅ FIXED   | `src/lib/utils/circuit-breaker.ts`; used for Anthropic, OpenAI, WhatsApp. |
| Timeouts             | ✅ FIXED   | Anthropic 30s, OpenAI 30s, WhatsApp 10s; health dep checks 5s.            |
| Retry Strategy       | ✅ FIXED   | `withRetry()` with exponential backoff; used in embeddings, WhatsApp.     |
| Graceful Degradation | ⚠️ PARTIAL | Feature flags; circuit open returns error (no fallback UI).               |
| Bulkhead Pattern     | ❌ MISSING | No resource isolation between tenants.                                    |

### 2.2 Data Integrity

| Item              | Status     | Finding                                                                      |
| ----------------- | ---------- | ---------------------------------------------------------------------------- |
| **Transactions**  | ✅ FIXED   | Stripe: idempotency + RPCs; Register: `register_create_org_and_profile` RPC. |
| Idempotency       | ✅ FIXED   | Stripe `stripe_event_try_acquire`; WhatsApp message dedup.                   |
| Data Validation   | ✅ PASS    | Zod schemas at API ingress.                                                  |
| Backup & Recovery | ⚠️ PARTIAL | Supabase managed; RPO/RTO in docs/SLOs.md.                                   |

### 2.3 Failure Management

| Item                 | Status      | Finding                                                                    |
| -------------------- | ----------- | -------------------------------------------------------------------------- |
| Error Classification | ⚠️ PARTIAL  | Retry wrapper treats transient errors; not all routes classify.            |
| Dead Letter Queues   | ✅ FIXED    | `failed_operations` table; `appendToDlq()` used in scout and contact.      |
| Fire-and-Forget      | ✅ IMPROVED | Failures written to DLQ; job queue abstraction in `src/lib/jobs/queue.ts`. |
| Health Checks        | ✅ IMPROVED | Liveness + readiness; `?deps=1` checks Stripe, Anthropic, WhatsApp.        |
| Graceful Shutdown    | ❌ MISSING  | No SIGTERM/SIGINT handlers.                                                |

---

## SECTION 3: PERFORMANCE ENGINEERING — Score: 76/100 (C+)

### 3.1 Query & Data Patterns

| Item             | Status      | Finding                                                                                                               |
| ---------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| **N+1 Queries**  | ✅ IMPROVED | Embeddings: chunked `Promise.allSettled`; shortlist: `createNotificationBatch`. Fitscore-agent N+1 noted for Phase 2. |
| SELECT \*        | ⚠️ PARTIAL  | Repositories still use `select("*")` in places; plan to replace with explicit columns.                                |
| Pagination       | ✅ FIXED    | Cursor-based pagination for candidates, jobs, applications.                                                           |
| Database Indexes | ✅ GOOD     | GIN, IVFFlat, composite indexes in place.                                                                             |

### 3.2 Caching

| Item                  | Status     | Finding                                                     |
| --------------------- | ---------- | ----------------------------------------------------------- |
| **Distributed Cache** | ❌ MISSING | No Redis; rate limit and feature flags hit DB or in-memory. |
| In-Memory Cache       | ⚠️ PARTIAL | Feature flags 60s TTL; circuit breaker state in-memory.     |
| Next.js Caching       | ⚠️ PARTIAL | `force-dynamic` on dashboard; no ISR.                       |
| CDN Caching           | ❌ MISSING | No edge caching for public content.                         |

### 3.3 Background Processing

| Item             | Status     | Finding                                                                 |
| ---------------- | ---------- | ----------------------------------------------------------------------- |
| Job Queue        | ⚠️ PARTIAL | Abstraction in `src/lib/jobs/queue.ts`; currently in-process + DLQ.     |
| Cron Jobs        | ⚠️ PARTIAL | Vercel cron; no overlap prevention.                                     |
| Async Processing | ⚠️ PARTIAL | AI scoring still in request path; queue abstraction allows future move. |

---

## SECTION 4: CODE QUALITY & CRAFTSMANSHIP — Score: 82/100 (B)

### 4.1 Architecture Quality

| Item               | Status  | Finding                                                  |
| ------------------ | ------- | -------------------------------------------------------- |
| Clean Architecture | ✅ GOOD | Repository → Service → API Route.                        |
| Repository Pattern | ✅ GOOD | 10 repositories; cursor pagination and DLQ integrated.   |
| Service Layer      | ✅ GOOD | Services use repositories; circuit breakers at boundary. |
| Modularity         | ✅ GOOD | No files > 500 lines.                                    |
| SOLID Principles   | ✅ GOOD | Single source for roles (`src/types/database.ts`).       |

### 4.2 Code Hygiene

| Item                   | Status  | Finding                            |
| ---------------------- | ------- | ---------------------------------- |
| TypeScript Strict Mode | ✅ PASS | `strict: true`.                    |
| `any` Usage            | ✅ PASS | Minimal; mostly in tests.          |
| Formatting             | ✅ PASS | Prettier + ESLint via lint-staged. |

### 4.3 Type Safety

| Item             | Status   | Finding                                                                                 |
| ---------------- | -------- | --------------------------------------------------------------------------------------- |
| Type Definitions | ✅ GOOD  | Types in `src/types`; Zod for validation.                                               |
| Role Types       | ✅ FIXED | `USER_ROLES` and `UserRole` from `src/types/database.ts`; RBAC and Zod use same source. |

### 4.4 Documentation & DX

| Item           | Status   | Finding                                               |
| -------------- | -------- | ----------------------------------------------------- |
| `.env.example` | ✅ FIXED | Documented 15+ env vars.                              |
| OpenAPI        | ✅ ADDED | `docs/openapi.yaml` with main endpoints.              |
| Migrations     | ✅ ADDED | `docs/MIGRATIONS.md`; numbered schema files.          |
| ADRs           | ✅ ADDED | ADR-001 (Supabase/Next), ADR-002 (multi-tenancy).     |
| SLOs           | ✅ ADDED | `docs/SLOs.md` (availability, latency, error budget). |

---

## SECTION 5: TEST COVERAGE & QA — Score: 52/100 (F)

### 5.1 Test Inventory

| Category          | Files  | Tests   | Coverage                                             |
| ----------------- | ------ | ------- | ---------------------------------------------------- |
| Unit Tests        | 5+     | ~40     | Mappers, types, validations, rate-limit, retry, csrf |
| Integration Tests | 2      | ~9      | API helpers, cron auth                               |
| E2E Tests         | 3      | ~24     | Playwright                                           |
| **Total**         | **10** | **60+** | **~5–10%** (thresholds 2/5/2/2% in CI)               |

### 5.2 Coverage Gaps

| Gap               | Status     | Note                                                       |
| ----------------- | ---------- | ---------------------------------------------------------- |
| API Routes        | OPEN       | Most routes untested; auth/webhook tests added in roadmap. |
| Repositories      | OPEN       | No repository tests.                                       |
| Services          | OPEN       | No service tests.                                          |
| Coverage gate     | ✅ DONE    | Vitest thresholds; CI runs `test:coverage`.                |
| PR coverage delta | ⚠️ PARTIAL | CI runs coverage; no explicit “fail if delta &lt; 0” step. |

### 5.3 Recommendations

- Add tests for auth (login, register, ensure-profile), Stripe webhook (including idempotency), and 2–3 CRUD routes.
- Add repository and service tests for Candidate, Job, Application.
- Consider raising thresholds to 10% then 20% as coverage grows.

---

## SECTION 6: SECURITY & TRUST — Score: 85/100 (B)

### 6.1 Critical Vulnerabilities (P0) — Resolved

| #   | Former Vulnerability       | Status                                                                     |
| --- | -------------------------- | -------------------------------------------------------------------------- |
| 1   | Hardcoded default password | **FIXED** — `SEED_DEMO_PASSWORD` required; no default; production blocked. |
| 2   | Test password in client    | **FIXED** — Test login via `/api/auth/test-login` (server-side, dev-only). |
| 3   | Auth error message leakage | **FIXED** — Generic "Invalid email or password" in login.                  |

### 6.2 Security Controls in Place

| Control          | Status | Detail                                                               |
| ---------------- | ------ | -------------------------------------------------------------------- |
| CSP              | ✅     | `Content-Security-Policy` in next.config.ts.                         |
| HSTS             | ✅     | `Strict-Transport-Security` in next.config.ts.                       |
| CSRF             | ✅     | `validateOrigin()` on login and register.                            |
| Cookie security  | ✅     | SameSite=Strict for auth.                                            |
| RBAC + org       | ✅     | `requireRole(..., resourceOrganisationId)` for org-scoped resources. |
| Input validation | ✅     | Zod at API boundaries.                                               |
| No SQL injection | ✅     | Supabase query builder.                                              |

### 6.3 Remaining Gaps

| Gap                       | Severity | Note                                     |
| ------------------------- | -------- | ---------------------------------------- |
| Dependency scanning in CI | P2       | No Snyk/npm audit fail on high/critical. |
| SBOM                      | P2       | Not generated.                           |
| MFA for admin             | P3       | Phase 3 item.                            |

---

## SECTION 7: OBSERVABILITY & OPERATIONS — Score: 76/100 (C+)

### 7.1 What Exists

| Component         | Status      | Detail                                                            |
| ----------------- | ----------- | ----------------------------------------------------------------- |
| Structured Logger | ✅          | JSON in prod; PII redaction (email, phone).                       |
| Sentry            | ✅ FIXED    | `reportError()` used in login, register, Stripe webhook.          |
| Correlation ID    | ✅ ADDED    | `x-request-id` in middleware.                                     |
| Slack alerts      | ✅ ADDED    | Cost alerts and daily threshold when `SLACK_WEBHOOK_URL` set.     |
| Health            | ✅ IMPROVED | Liveness + readiness; `?deps=1` for Stripe, Anthropic, WhatsApp.  |
| SLOs              | ✅ ADDED    | `docs/SLOs.md` (availability, latency, error rate, error budget). |
| Runbooks          | ✅          | `docs/RUNBOOKS.md`.                                               |
| Agent metrics     | ✅          | `agent_logs` table; cost tracking.                                |

### 7.2 Gaps

| Gap                 | Status  | Note                        |
| ------------------- | ------- | --------------------------- |
| Distributed tracing | OPEN    | No OpenTelemetry (Phase 3). |
| API request timing  | OPEN    | No middleware p50/p95.      |
| Metrics export      | OPEN    | No Prometheus/Datadog.      |
| PII redaction       | ✅ DONE | In logger for production.   |

---

## SECTION 8: SCALABILITY & GROWTH — Score: 74/100 (C+)

### 8.1 Strengths

| Item              | Status | Detail                                 |
| ----------------- | ------ | -------------------------------------- |
| Stateless         | ✅     | Session in cookies; Supabase for data. |
| Cursor pagination | ✅     | Candidates, jobs, applications.        |
| Circuit breakers  | ✅     | Isolate external service failures.     |
| Multi-tenancy RLS | ✅     | Org-scoped access enforced.            |
| Vector search     | ✅     | pgvector with IVFFlat.                 |

### 8.2 Remaining Risks

| Risk             | Severity | Note                                             |
| ---------------- | -------- | ------------------------------------------------ |
| No Redis         | MEDIUM   | Rate limit and feature flags hit DB/memory.      |
| No job queue     | MEDIUM   | Abstraction in place; Inngest/Trigger.dev later. |
| No read replicas | LOW      | Phase 3.                                         |

---

## SECTION 9: MAINTAINABILITY & EVOLVABILITY — Score: 78/100 (C+)

### 9.1 Strengths

| Item                | Status | Detail                                          |
| ------------------- | ------ | ----------------------------------------------- |
| `.env.example`      | ✅     | All major env vars documented.                  |
| Docker Compose      | ✅     | Local Postgres for dev.                         |
| Parallel CI         | ✅     | Lint, typecheck, test in parallel.              |
| Single source roles | ✅     | `src/types/database.ts`; used in RBAC and Zod.  |
| OpenAPI             | ✅     | `docs/openapi.yaml`.                            |
| Migrations doc      | ✅     | `docs/MIGRATIONS.md`.                           |
| ADRs                | ✅     | Supabase/Next, multi-tenancy.                   |
| Data residency      | ✅     | `docs/DATA_RESIDENCY.md` for multi-region prep. |

### 9.2 Weaknesses

| Item          | Detail                                      |
| ------------- | ------------------------------------------- |
| Setup script  | No single `scripts/setup.sh` for full init. |
| Mock services | No full local mock for external APIs.       |

---

## SECTION 10: COMPLIANCE & GOVERNANCE — Score: 62/100 (D)

### 10.1 What Exists

| Item                 | Status | Detail                      |
| -------------------- | ------ | --------------------------- |
| GDPR consent/erasure | ✅     | Schema and erasure API.     |
| PII masking          | ✅     | In API responses and logs.  |
| SLOs / error budget  | ✅     | Documented in docs/SLOs.md. |

### 10.2 Gaps

| Gap                 | Regulation  | Note     |
| ------------------- | ----------- | -------- |
| Immutable audit log | GDPR/SOC 2  | Phase 3. |
| SBOM                | SOC 2       | Phase 2. |
| Pen test evidence   | SOC 2 / PCI | Phase 3. |

---

## PRIORITIZED REMEDIATION PLAN (REVISED)

### Phase 1 (Critical) — **COMPLETED**

- Database transactions (Stripe, register)
- Stripe idempotency
- Security (CSP, HSTS, CSRF, no hardcoded pwd, auth error, RBAC org)
- Timeouts and retry on external calls
- Sentry via reportError; PII redaction; correlation ID; Slack alerts
- N+1 fixes (embeddings, shortlist); next/dynamic
- .env.example; enum single source; parallel CI; Docker Compose
- Circuit breakers; DLQ; cursor pagination; OpenAPI; migrations doc; ADRs; SLOs; health deps

### Phase 2 (High) — **PARTIALLY COMPLETE**

| #   | Item                       | Status   | Next step                                  |
| --- | -------------------------- | -------- | ------------------------------------------ |
| 1   | Redis caching              | OPEN     | Upstash for rate limit, feature flags      |
| 2   | Raise test coverage        | OPEN     | Target 70%+; add auth, webhook, CRUD tests |
| 3   | Coverage delta in CI       | OPTIONAL | Fail PR if coverage drops                  |
| 4   | Dependency scanning / SBOM | OPEN     | Snyk or npm audit; CycloneDX               |
| 5   | Replace SELECT \* in repos | OPEN     | Explicit columns                           |

### Phase 3 (Enterprise)

- Job queue (Inngest/Trigger.dev) for AI scoring and notifications
- OpenTelemetry; API timing middleware; dashboards
- Load testing (k6/Artillery); visual regression
- Formal audit log; MFA for admin; WAF
- Read replicas; edge caching; connection pooling

### Phase 4 (Excellence)

- Multi-region; SOC 2 Type II; bug bounty; sharding; mutation testing

---

## APPENDIX A: CODEBASE STATISTICS (unchanged)

| Metric             | Value |
| ------------------ | ----- |
| Total Source Files | ~291  |
| TypeScript Files   | ~151  |
| API Routes         | 60    |
| Lib Modules        | 74    |
| Repositories       | 10    |
| Services           | 8     |
| Test Files         | 10    |
| Passing Tests      | 60+   |

## APPENDIX B: KEY FILES ADDED/MODIFIED (ROADMAP)

| Area          | Files                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Security      | next.config.ts (CSP, HSTS), src/lib/security/csrf.ts, rbac.ts (org), auth routes, seed-demo-users, test-login                                  |
| Reliability   | supabase/schema/38_stripe_events_and_rpc.sql, 39_failed_operations_dlq.sql, retry.ts, circuit-breaker.ts, dlq.ts, webhooks/stripe, register    |
| Observability | report-error.ts, logger.ts (PII), middleware (x-request-id), alerts.ts (Slack)                                                                 |
| Performance   | embeddings.ts (batch), shortlist (batch notify), next/dynamic (FitScoreCardMock, AdminUsersTable)                                              |
| Quality       | .env.example, src/types/database.ts, ci.yml (parallel), docker-compose.yml, docs/openapi.yaml, MIGRATIONS.md, ADRs, SLOs.md, DATA_RESIDENCY.md |
| Health        | api/health/route.ts (deps=1)                                                                                                                   |
| Jobs          | src/lib/jobs/queue.ts                                                                                                                          |

---

## SECTION 12: FITSCORE SCORING HARDENING (May 2026 addendum)

This section documents **operational controls shipped** in the May 18–19 sprint. Full architecture: **`docs/SCORING_ARCHITECTURE.md`**.

### 12.1 Duplicate spend prevention

| Control             | Implementation                                      | Ops notes                              |
| ------------------- | --------------------------------------------------- | -------------------------------------- |
| **4-hour dedupe**   | `findRecentFitScoreForDedupe` in `scoring-guard.ts` | Bypass with `force: true` on rescoring |
| **Concurrent lock** | Table `fit_score_scoring_locks` + Postgres RPCs     | Stale lock TTL 2 minutes               |
| **Merged call cap** | `MERGED_EXTRACTION_MAX_ATTEMPTS=1`                  | Avoids retry storms on bad JSON        |

### 12.2 Cost attribution and ledger

| Control            | Implementation                                   | Ops notes                                                          |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------ |
| **Source tagging** | `FitScoreScoringSource` on every `computeSingle` | Values: `upload`, `api`, `rescore`, `script`, `investigation`      |
| **Ledger rows**    | `recordAnthropicCostEvent` via `anthropic.ts`    | Includes `job_id`, `candidate_id`, `metadata.source`, cache tokens |
| **Dedupe events**  | `fitscore_dedupe_skip` observability             | Rolled into daily metrics                                          |

Ledger acceptance baseline (2026-05-09): ~**$0.07–0.10 USD** per profile when vision is off and cache is warm. Brief: `docs/briefs/platform-cost-ledger-hardening.md`.

### 12.3 Parse chain and model path

| Tier                | Default policy (May 2026)                                                     |
| ------------------- | ----------------------------------------------------------------------------- |
| 1 — pdfjs/DOCX/text | Free; sufficient at ≥ `RESUME_PARSE_MIN_CHARS` (2000)                         |
| 2 — Haiku text      | On unless `FF_CV_PARSER_HAIKU_ENABLED=false`                                  |
| 3 — Sonnet vision   | **Off in prod** via `FF_VISION_FALLBACK_ENABLED=false`                        |
| Scoring call        | **Sonnet** merged extraction+verdict when `FF_MERGED_EXTRACTION_VERDICT=true` |
| JSON failure        | **Deterministic fallback** when `FF_DETERMINISTIC_FALLBACK_ENABLED=true`      |

### 12.4 Monitoring

| Asset                                       | Purpose                                                      |
| ------------------------------------------- | ------------------------------------------------------------ |
| **`scoring_daily_metrics`** table           | UTC-day aggregates (dedupe, tiers, tokens, cache, fallbacks) |
| **Cron** `/api/cron/fitscore-daily-metrics` | Schedule `30 0 * * *` in `vercel.json`                       |
| **`FITSCORE_SCORING_DIAGNOSTIC`**           | Per-call cache diagnostics for investigations                |
| **`v2_score_breakdown.signals_log`**        | Per-score extraction/parse audit trail                       |

**Alerting recommendations:** cron miss > 1 day; deterministic fallback rate spike; cache read rate drop below cohort baseline; ledger vs Anthropic Console gap > 5% (UTC day).

### 12.5 Score display and JD Base

| Item                                      | Status                                      |
| ----------------------------------------- | ------------------------------------------- |
| Primary blend **25% skills / 75% intent** | `FF_FITSCORE_BLEND_V2`                      |
| **Three metrics** on recruiter cards      | FitScore, ICP Match, Market Rank            |
| **Shadow TriBlend**                       | `shadow_score` for comparison only          |
| **JD Base wizard**                        | 3 screens — `docs/JD_BASE_APPROVAL_FLOW.md` |

### 12.6 Production readiness impact

| Dimension       | Effect                                                                        |
| --------------- | ----------------------------------------------------------------------------- |
| **Financial**   | Dedupe + locks reduce runaway API cost; vision flag controls tail spend       |
| **Operational** | Daily metrics + source tags improve incident response                         |
| **Reliability** | Deterministic fallback prevents total scoring failure on one bad LLM response |

Remaining gaps unchanged from main audit: low automated test coverage, evidence-quote and confidence-band feature flags still gated (`docs/ops/HYBRID_V2_CLAIM_ALIGNMENT.md`).

---

**End of Re-Audit Report**

_This re-audit reflects the codebase state after the Platform Readiness Roadmap (Phases 1–2) implementation. Overall score improved from 64.75 to 77.25 (C → B). Production readiness for controlled launch: **YES**._
