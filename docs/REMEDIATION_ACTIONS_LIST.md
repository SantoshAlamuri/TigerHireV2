# TigerHire Remediation — Actions by Owner

**Related:** [REMEDIATION_FIX_ROUTE.md](./REMEDIATION_FIX_ROUTE.md) (file-level implementation path), [AUDIT_REMEDIATION_TRACKER.md](./AUDIT_REMEDIATION_TRACKER.md) (full audit + scorecard that spawned the task list).

Actions from the Complete Remediation Task List (Target 4.2–4.6), split into **Cursor-only** (code/automation) and **Cursor + Manual** (needs human setup or decisions).

---

## Actions for Cursor (Automated / Code-centric)

These can be done directly by writing or changing code and config.

| #   | Area           | Task                                                                                                                           |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Security       | Implement WhatsApp webhook signature verification using `WHATSAPP_WEBHOOK_SECRET` before processing payloads                   |
| 2   | Security       | Fix unaudited route fallthrough bug: debug and fix POST `/api/public/jobs` returning 500                                       |
| 3   | Security       | Remove `unsafe-eval` from CSP in `next.config` and verify                                                                      |
| 4   | Code Quality   | Consolidate duplicate Zod schemas: refactor `src/lib/schemas/` into single source in `src/lib/validations/`, ensure tests pass |
| 5   | Code Quality   | Add Zod schema for POST `/api/hiring-requests` input validation                                                                |
| 6   | Security       | Fix config: use `APIFY_API_TOKEN` instead of `CRON_SECRET` where applicable                                                    |
| 7   | Supply Chain   | Add OWASP secret scanning to CI                                                                                                |
| 8   | Supply Chain   | Add Sentry or CodeQL SAST to CI for JavaScript                                                                                 |
| 9   | Observability  | Add improved Sentry reporting in all API catch blocks                                                                          |
| 10  | Security       | Restrict rate limiting to all public write endpoints (identify POST/PATCH, implement logic)                                    |
| 11  | Runtime Safety | Make feature flags fail-closed on error in `feature-flags.ts` catch blocks                                                     |
| 12  | Runtime Safety | Wrap all API handler `request.json()` in try/catch                                                                             |
| 13  | Code Quality   | Raise test coverage thresholds to 80% in `vitest.config.ts` and add/improve tests                                              |
| 14  | Ops Readiness  | Generate `.env.example` from `src/lib/config/env.ts`                                                                           |
| 15  | Code Quality   | Add ESLint complexity rules in `.eslintrc.json`                                                                                |
| 16  | Build          | Add Prettier to devDependencies and configure                                                                                  |
| 17  | Observability  | Increase Sentry trace sampling to 25–50%                                                                                       |
| 18  | Observability  | Add OpenTelemetry custom spans for key functions                                                                               |
| 19  | Observability  | Add RED (Rate, Error, Duration) metrics for key API handlers                                                                   |
| 20  | Supply Chain   | Add SBOM generation to CI (e.g. cyclonedx-node-package)                                                                        |
| 21  | Performance    | Add k6 load tests to CI with max response time target 500ms                                                                    |
| 22  | Code Quality   | Add dead code detection (e.g. ts-prune) in CI                                                                                  |
| 23  | Runtime Safety | Add AbortSignal propagation to downstream client calls                                                                         |
| 24  | Runtime Safety | Add graceful shutdown handlers for SIGTERM/SIGINT                                                                              |
| 25  | Supply Chain   | Pin audited dependency versions in CI (package.json)                                                                           |
| 26  | Code Quality   | Audit and add Zod validation to all remaining API routes                                                                       |
| 27  | Performance    | Add bundle size regression detection (e.g. @next/bundle-analyzer) in CI                                                        |
| 28  | Code Quality   | Write tests for critical auth flows (registration, password reset, SSO)                                                        |
| 29  | Code Quality   | Write tests for Stripe checkout and subscription flows                                                                         |
| 30  | Code Quality   | Write tests for hiring request creation and approval flows                                                                     |
| 31  | Code Quality   | Write tests for candidate/job matching (talent scout, matching, fit score)                                                     |
| 32  | Code Quality   | Write integration tests for rate limiting and circuit breaker                                                                  |
| 33  | Code Quality   | Raise coverage thresholds to 50% (branches etc.) in vitest and add tests                                                       |
| 34  | Code Quality   | Add mutation testing (Stryker) targeting mutation score > 80%                                                                  |
| 35  | Supply Chain   | Add license compliance scanning (e.g. FOSSA) to CI                                                                             |
| 36  | Deployment     | Add artifact signing (Sigstore/Cosign) for provenance in deployment                                                            |
| 37  | Deployment     | Implement canary/blue-green deployment (e.g. Vercel CLI)                                                                       |
| 38  | Ops Readiness  | Add chaos engineering tests (e.g. Janus/Gremlin) for Datastore unavailability                                                  |
| 39  | Observability  | Add continuous profiling (e.g. Pyroscope/Parca) for CPU/memory in production                                                   |
| 40  | Data           | Implement expand-contract migration patterns (schema + data + contract)                                                        |
| 41  | Code Quality   | Raise coverage to 80%+ for specified branches (TDD/BDD etc.)                                                                   |
| 42  | Supply Chain   | Pin all dependency versions in package.json (minimise `^`)                                                                     |

---

## Actions for Cursor + Manual (Human intervention required)

Cursor can implement or draft; a human must configure, decide, or verify.

| #   | Area          | Task                                   | Manual part                                                                      |
| --- | ------------- | -------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Security      | Configure `WHATSAPP_WEBHOOK_SECRET`    | Add secret in Vercel (and any other env); Cursor can document steps              |
| 2   | Security      | Test CSP changes end-to-end            | Human must browse dashboard, job creation, candidate view and verify CSP         |
| 3   | Supply Chain  | Verify Dependabot configuration        | Human confirms `dependabot.yml` exists and is correct; Cursor can report content |
| 4   | Deployment    | Set up staging environment             | Human sets up/verifies Vercel preview/staging and DB; Cursor can help scripts    |
| 5   | Data          | Decide and implement migration tooling | Human chooses migration approach; Cursor implements chosen solution              |
| 6   | Ops Readiness | Verify and create ADRs                 | Human reviews/creates ADRs; Cursor can draft or provide templates                |
| 7   | Deployment    | Decide rollback strategy               | Human chooses Vercel native vs Git-based rollback; Cursor can implement          |
| 8   | Deployment    | Decide on Dockerfile need              | Human decides based on Vercel-only vs multi-cloud                                |
| 9   | Supply Chain  | Consider private npm registry          | Human evaluates Artifactory/Nexus etc.; Cursor can research or assist setup      |
| 10  | Observability | Add PagerDuty/OpsGenie on-call         | Human configures schedules and incident process; Cursor can do integration code  |
| 11  | Build         | Evaluate reproducible builds           | Human assesses options (Nix, pinned Node, etc.); Cursor can help implement       |

---

## Quick reference

- **Cursor-only:** 42 tasks — security, code quality, observability, supply chain, deployment, data, build, performance.
- **Cursor + Manual:** 11 tasks — env/secrets, CSP testing, Dependabot, staging, migrations, ADRs, rollback, Dockerfile, private npm, on-call, reproducible builds.

Use this list to assign work: Cursor for the first table, Cursor + a human for the second.
