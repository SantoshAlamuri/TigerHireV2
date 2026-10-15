# Elite Engineering Standard — PR Self-Review Checklist

**Target:** 90+ on all metrics | Maintainable | Production-ready  
**Use:** Complete this checklist before opening a PR. Gate merge on all **Required** items.

**Automated rating:** Run `npm run rate` to get a numeric score and see which checks are measured automatically (typecheck, lint, format, coverage, npm audit, no `any`, cron auth, reportError in routes, Zod usage, file length, README/.env.example, husky/lint-staged, runbooks). See [ELITE-ENGINEERING-STANDARD.md](./ELITE-ENGINEERING-STANDARD.md#how-to-run-the-rating).

---

## 1. Performance & Speed (Target: 95+ Lighthouse/Benchmarks)

| #   | Check                                                                         | Required | Notes                                                      |
| --- | ----------------------------------------------------------------------------- | -------- | ---------------------------------------------------------- |
| P1  | Time complexity documented or O(n log n) or better for new algorithms         | ✓        | Add JSDoc or comment on trade-offs if not optimal          |
| P2  | No unnecessary heap allocations in hot paths; consider object pools for loops | ✓        | Especially in list/pipeline and scoring code               |
| P3  | Non-critical resources lazy-loaded or deferred until interaction              | ✓        | Images, heavy components, below-fold content               |
| P4  | Caching: L1 (memory) → L2 (Redis) → L3 (CDN) where applicable                 | ✓        | See `src/lib/redis/cache.ts`; document cache keys          |
| P5  | Bundle: tree-shaking preserved; no large new deps without justification       | ✓        | Run `ANALYZE=true npm run build` for new chunks            |
| P6  | Code-split by route; initial JS target &lt;200KB (gzipped)                    | ✓        | Check bundle report; avoid importing whole libs            |
| P7  | CPU-heavy work in workers/threads; I/O is async                               | ✓        | e.g. PDF parsing, fit-score pipelines                      |
| P8  | No performance regression: budgets in CI or manual check                      | ✓        | Vitest coverage thresholds; add Lighthouse to CI if needed |

---

## 2. Code Quality & Architecture (Target: 90+ Maintainability)

| #   | Check                                                                            | Required | Notes                                                       |
| --- | -------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| Q1  | Single responsibility: one clear purpose per module/component                    | ✓        | Split files &gt;400 lines (e.g. pipeline pages)             |
| Q2  | Open/closed: extend via composition or config, not copy-paste                    | ✓        | Use Strategy/Factory where behaviour varies                 |
| Q3  | TypeScript strict mode; no `any`; 100% typed public APIs                         | ✓        | `tsconfig.typecheck.json` must pass                         |
| Q4  | New public APIs have JSDoc (params, return, throws)                              | ✓        | Especially in `src/lib/` and API route helpers              |
| Q5  | Design patterns (Observer, Strategy, etc.) have a one-line justification comment | ✓        | When introducing a pattern, document why                    |
| Q6  | Layers respected: Domain → Use Case → Interface → Framework                      | ✓        | No UI imports in domain; API routes call use cases/services |
| Q7  | Unit test for new logic; integration test for new API/DB flows                   | ✓        | See `tests/unit`, `tests/integration`                       |
| Q8  | Complex flows have sequence diagram or inline flow description                   | ✓        | In ADR or doc; e.g. apply flow, Stripe webhook              |

---

## 3. Security & Reliability (Target: 95+ OWASP/SonarQube)

| #   | Check                                                                          | Required | Notes                                                     |
| --- | ------------------------------------------------------------------------------ | -------- | --------------------------------------------------------- |
| S1  | All external inputs validated with Zod/io-ts at boundaries                     | ✓        | Request body, query, headers; no `body?.x` without schema |
| S2  | File uploads: validate by content (magic bytes), not only `file.type`          | ✓        | See apply route and agency upload pattern                 |
| S3  | Errors: structured logging; no bare `catch` that swallows                      | ✓        | Use `reportError()` before returning 4xx/5xx              |
| S4  | No hardcoded secrets; use env/vault only                                       | ✓        | Check `@/lib/config/env.ts` and schema                    |
| S5  | Rate limiting on public/mutating endpoints                                     | ✓        | Use `checkRateLimit`; fail closed if check throws         |
| S6  | Cron routes use `validateCronSecret(request)`                                  | ✓        | Any new `/api/cron/*` must enforce this                   |
| S7  | Sensitive tokens in headers (e.g. `Authorization: Bearer`), not URL            | ✓        | e.g. Apify, webhooks                                      |
| S8  | Dependency audit: no new high/critical; CI runs `npm audit --audit-level=high` | ✓        | Fix or accept with ticket                                 |

---

## 4. Developer Experience

| #   | Check                                                                       | Required | Notes                                   |
| --- | --------------------------------------------------------------------------- | -------- | --------------------------------------- |
| D1  | `git clone && npm install && npm run dev` works in &lt;5 min                | ✓        | README and .env.example up to date      |
| D2  | ESLint + Prettier pass; pre-commit (Husky + lint-staged) enforced           | ✓        | `npm run lint`, `npm run format:check`  |
| D3  | Conventional commits where applicable; no “fix stuff”                       | ✓        | Enables automated changelog             |
| D4  | New modules follow existing patterns (e.g. `getAuthContext`, `requireAuth`) | ✓        | See `src/lib/api-helpers.ts`            |
| D5  | Source maps and structured logs for debugging                               | ✓        | Sentry + route/userId/requestId context |

---

## 5. Scalability & Ops (Target: 99.9% Uptime)

| #   | Check                                                                  | Required | Notes                                |
| --- | ---------------------------------------------------------------------- | -------- | ------------------------------------ |
| O1  | New API: pagination or cursor for list endpoints                       | ✓        | Avoid unbounded queries              |
| O2  | DB: new queries use indexes; no N+1 (batch select/insert where needed) | ✓        | See signals ingest; use RPC for bulk |
| O3  | Observability: new critical paths have metrics/logs/traces             | ✓        | OpenTelemetry; Sentry for errors     |
| O4  | Runbook or doc update for new failure modes or config                  | ✓        | See `docs/RUNBOOKS.md`               |

---

## Quick Gate (Must Pass Before Submit)

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` and `npm run format:check` pass
- [ ] `npm run test` (or scope) passes; coverage not decreased below thresholds
- [ ] No new `any`; no new high/critical audit issues
- [ ] All **Required** checklist items above satisfied for changed areas

---

## References

- Full standard: Elite Engineering Standard v1.0 (this repo)
- Production gaps: [PRODUCTION-READINESS-CODE-REVIEW.md](./archive/2026-q1-q2/PRODUCTION-READINESS-CODE-REVIEW.md)
- ADRs: [docs/adr/](./adr/), root `docs/ADR-*.md`
