# 4-week sprint closure status

**Last updated:** 2026-05-18

## Automated in repo (engineering)

| Item                                                     | Status | How to verify                                                            |
| -------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| Rate-limit proof scripts                                 | Done   | `npm run verify:rate-limits` / `npm run launch:readiness:auto`           |
| Playwright smoke vs full                                 | Done   | `npm run test:e2e:smoke` / `test:e2e:full`                               |
| CI E2E smoke-only on PR                                  | Done   | `.github/workflows/ci.yml`                                               |
| `npm run gate` (lint e2e fix)                            | Done   | `npm run gate`                                                           |
| Dev release gate                                         | Done   | `SKIP_E2E=1 npm run release-gate:dev`                                    |
| Post-merge gate workflow                                 | Done   | `.github/workflows/release-gate-dev.yml`                                 |
| Tenant: `assertJobAccess` + jobs/applications routes     | Done   | `tests/unit/job-access-tenant.test.ts`, `applications-id-tenant.test.ts` |
| API guard audit (critical CSRF = 0)                      | Done   | `node scripts/audit-api-routes.mjs`                                      |
| Plan stage email dispatch v1                             | Done   | `tests/unit/plan-stage-dispatch-email.test.ts`                           |
| Agent smokes (CV, JD intel, orchestrator noop)           | Done   | `tests/integration/agents-smoke.test.ts`                                 |
| Scoring DLQ unit test                                    | Done   | `tests/unit/scoring-dlq.test.ts`                                         |
| Promote workflow: ga-sweep + audit (+ optional E2E)      | Done   | `promote-to-production.yml`                                              |
| Plan beta env helper                                     | Done   | `node scripts/print-plan-beta-env.mjs`                                   |
| Safety pass: screening CSRF + tenant job access          | Done   | `screening/trigger`, `screening/override`, `settings/screening`          |
| Shared application route access helper                   | Done   | `src/lib/applications/assert-application-access.ts`                      |
| `npm run security:safety-check`                          | Done   | Audit + tenant tests + ga-sweep                                          |
| Dev route production guard audit                         | Done   | Fails CI if `/api/debug/*` lacks `NODE_ENV` guard                        |
| P0 tenant: legacy fit-score, orchestrator, pipeline bulk | Done   | `assertJobAccess` on cross-org paths                                     |
| Recruitment plan POST CSRF                               | Done   | `validateOrigin` on POST                                                 |
| Enterprise launch script                                 | Done   | `npm run launch:enterprise-ready` (security + stability + readiness)     |
| Release gate tenant regression                           | Done   | fit-score, applications, screening unit tests in `release-gate:dev`      |

## Manual / ops (cannot close in Git alone)

| Item                                | Owner   | Action                                                                                                        |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| Uptime monitor + on-call screenshot | Ops     | [UPTIME-MONITOR-CONFIG.md](./UPTIME-MONITOR-CONFIG.md)                                                        |
| `db:push` on preview/prod           | Ops     | Before plan beta                                                                                              |
| Enable plan flags on Vercel         | Ops     | `node scripts/print-plan-beta-env.mjs`                                                                        |
| E2E smoke green in CI               | Eng/Ops | `E2E_APPLY_ORG_SLUG` + demo users; local 12/15 pass (auth/plan login flake without seed)                      |
| Preview login for Plan smoke        | Ops     | Vercel Preview: `SEED_DEMO_PASSWORD` (+ optional `SEED_DEMO_SECRET`); see `scripts/phase0-smoke-checklist.md` |
| Meta `th_screening_invite`          | Ops     | Supabase: **PENDING** (2026-05-18) — set `WHATSAPP_SCREENING_TEMPLATE_NAME` after APPROVED                    |
| Screening → application card (#3)   | Eng     | Run one WhatsApp screening E2E; QA job had 0 `application_screening_answers` rows                             |
| WhatsApp referral phone #3 (#2)     | Human   | Employee refer → new candidate number (not the two test phones)                                               |
| Promote `dev` → `main` (#7)         | Ops     | After preview smokes green + plan flags on production                                                         |
| Secrets rotation dry-run            | Ops     | Optional before GA                                                                                            |
| Commit + PR → `dev` → soak          | Eng     | All closure files must land on `dev`                                                                          |

## Deferred (post-sprint)

HRIS sync, coding assessments, FitScore v3 production, SCIM hardening, tenant Wave 2 (~300 routes), full plan email template library.
