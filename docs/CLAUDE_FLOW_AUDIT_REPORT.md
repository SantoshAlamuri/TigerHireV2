# Claude Flow Audit Report — Code, Tests, Security

**Date:** 2026-03-06  
**Scope:** TigerHire codebase — lint, tests, dependency audit, security scan

---

## 1. Lint

- **Command:** `npm run lint` (ESLint)
- **Result:** Completed; no errors reported in run.

---

## 2. Tests (Vitest)

- **Command:** `npm test`
- **Result:** Multiple failures; summary below.

### Failures to address

| Area                                | Issue                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **auth-register-route**             | Mock missing `RATE_LIMIT_PRESETS` from `@/lib/security/rate-limit` — add to `vi.mock` or use `importOriginal` for partial mock. |
| **auth-login-route**                | `supabase.auth.signOut is not a function` — ensure auth mock exposes `signOut`.                                                 |
| **apply-routes**                    | 6 tests failing (file upload, slug, size, type, 404, 200).                                                                      |
| **public-routes**                   | 9 tests failing (validation, 200 responses).                                                                                    |
| **resume-versions-route**           | 2 failures (201 create, 200 set default).                                                                                       |
| **route-span**                      | `calls Sentry.startSpan with route name` failing.                                                                               |
| **employees-routes**                | 1 failure: `returns 201 on successful referral`.                                                                                |
| **fitscore-routes**                 | 3 failures (403 candidate, 201 compute).                                                                                        |
| **profile-service**                 | 1 failure: `returns profile with candidate record for candidate_pro`.                                                           |
| **auth-flows (functional)**         | 3 failures (401 invalid creds, 200 valid, 201 registration).                                                                    |
| **circuit-breaker-perf**            | 1 failure: `open-state rejection` throughput.                                                                                   |
| **stress/concurrent-service-calls** | 1 failure: `handles 100 concurrent JobService.list calls`.                                                                      |

### Warnings

- **React tests:** Several components (`CookieConsentBanner`, `NotificationDropdown`) trigger “not wrapped in act(...)” — wrap state-updating code in `act()`.
- **Mocks:** Some routes log Supabase/email mock issues (e.g. `supabase.from(...).select(...).single is not a function`); align mocks with actual API shape.

---

## 3. Dependency vulnerabilities (npm audit)

- **Total:** 10 vulnerabilities (2 moderate, 8 high).

| Package                  | Severity | Issue                                             |
| ------------------------ | -------- | ------------------------------------------------- |
| **ajv**                  | moderate | ReDoS with `$data` option                         |
| **dompurify**            | moderate | XSS (3.1.3–3.3.1)                                 |
| **minimatch**            | high     | ReDoS (multiple advisories)                       |
| **rollup**               | high     | Arbitrary file write via path traversal           |
| **serialize-javascript** | high     | RCE via RegExp.flags / Date.prototype.toISOString |

**Recommended actions:**

- Run `npm audit fix` for fixes that do not require breaking changes.
- For `serialize-javascript` and dependency chain (`@ducanh2912/next-pwa`, workbox, etc.), evaluate `npm audit fix --force` or upgrade/remove PWA stack; test thoroughly after any breaking change.

---

## 4. Security scan (code)

- **Secrets / credentials:** No hardcoded API keys or secrets found in `src`. Configuration uses `process.env` and centralised config (e.g. `src/lib/config/env.ts`).
- **Cron / webhooks:** Cron routes and WhatsApp webhook validate `CRON_SECRET` / webhook signature; seed/demo routes gated by `SEED_DEMO_SECRET` or dev-only.
- **Auth:** Login/register use Supabase; passwords not logged; error messages sanitised (e.g. `sanitize-auth-error`).
- **Sensitive routes:** Debug/test routes (e.g. `/api/debug/*`, test-login, test-upload) correctly restricted to non-production.

**Recommendation:** Keep using env-based config; ensure `.env` and `.env.local` are in `.gitignore` and never committed.

---

## 5. Claude Flow swarm

- **Swarm ID:** `swarm-mmegjsmy`
- **Strategy:** testing
- **Agents:** Test Lead, 2× Unit Tester, 2× Integration Tester, QA Reviewer
- **Objective:** Code check, full test run, npm audit, secret/credential scan, oversized files, vulnerability report.

Monitor with: `claude-flow swarm status swarm-mmegjsmy` (or `claude-flow swarm status`).

---

## 6. Recommended next steps

1. **Dependencies:** Run `npm audit fix`; then reassess remaining issues and whether to upgrade or replace the PWA-related stack.
2. **Tests:** Fix rate-limit and Supabase auth mocks first (register, login, then apply/public/resume/fitscore/profile and functional auth-flows).
3. **React tests:** Wrap state updates in `act()` in component tests and fix any async timing.
4. **Ongoing:** Run `npx @claude-flow/cli@latest security scan` after security-related changes (per project rules).
