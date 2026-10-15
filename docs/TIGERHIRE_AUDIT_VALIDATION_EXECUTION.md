# TigerHire Audit Validation Execution

This document implements the approved audit-validation plan without changing the plan file.

## 1) Corrected Claim Matrix (Code-Verified)

Legend:

- `Confirmed` = claim matches code as-is.
- `Partially True` = directional claim is right, but wording/extent is inaccurate.
- `Incorrect` = claim is contradicted by current code.

| Claim                                                | Verdict        | Why (code-grounded)                                                                                                   | Primary Evidence                                                                            |
| ---------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| TS strict + quality guardrails are strong            | Confirmed      | `strict` and key TS safety settings are enabled; ESLint has explicit file/function size rules                         | `tsconfig.json`, `eslint.config.mjs`                                                        |
| Coverage blind spot for page/layout UX               | Confirmed      | Vitest coverage excludes `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` patterns                                | `vitest.config.ts`                                                                          |
| CSRF is Origin/Referer only (no double-submit token) | Confirmed      | CSRF middleware validates `Origin`/`Referer` and allowed origins; no per-session/request token check                  | `src/lib/security/csrf.ts`                                                                  |
| Cron overlap risk exists                             | Confirmed      | `score-batch` inserts `cron_runs` audit rows but no lease/advisory lock prevents concurrent overlap                   | `src/app/api/cron/score-batch/route.ts`, `supabase/migrations/20250307180100_cron_runs.sql` |
| Upload path lacks deep trust checks                  | Confirmed      | Upload enforces allowlisted MIME + 10MB max, but trusts client-supplied `file.type` and has no content sniff/AV stage | `src/app/api/candidates/upload-resume/route.ts`                                             |
| OAuth domain verification might be missing           | Incorrect      | Callback enforces `resolveOauthCompanyFromEmail()` and requires `reason === "domain_verified"`                        | `src/app/api/auth/callback/route.ts`, `src/lib/sso/domain.ts`                               |
| Anthropic lacks circuit breaker                      | Incorrect      | Anthropic calls use `createResilientCall` with breaker/timeout/retry wrapper                                          | `src/lib/services/anthropic.ts`, `src/lib/utils/resilient-call.ts`                          |
| Inngest primitive exists but is unused               | Incorrect      | `enqueue()` is used by multiple routes and mapped to Inngest events                                                   | `src/lib/jobs/queue.ts`, `src/app/api/**/route.ts`                                          |
| Rate limiting is uniformly per-user                  | Partially True | Many endpoints use `ctx.userId`, but others use org and/or IP keys; policy is mixed                                   | `src/lib/security/rate-limit.ts`, `src/app/api/**/route.ts`                                 |
| `next/font` / `next/image` absent                    | Incorrect      | App uses `next/font` in root layout; image usage exists in codebase                                                   | `src/app/layout.tsx`, `src/components/TigerHireLogo.tsx`                                    |
| Only 3 loading boundaries in app router              | Confirmed      | Exactly three `loading.tsx` files exist in `src/app`                                                                  | `src/app/**/loading.tsx`                                                                    |
| RLS is broadly enabled                               | Confirmed      | Many migrations include `ENABLE ROW LEVEL SECURITY` across core tables                                                | `supabase/migrations/*.sql`                                                                 |

## 2) Re-Ranked ROI Fixes (Preview-Focused)

This re-rank removes already-solved items and elevates unresolved high-risk issues.

1. **Add DB-backed cron lease/mutex for long-running cron jobs**
   - Why: Prevents overlap cascades and dogpile failure when `score-batch` runs long.
   - Core touchpoints: `src/app/api/cron/score-batch/route.ts`, new SQL migration.

2. **Harden upload trust path with server-side content sniffing**
   - Why: Resume upload is untrusted binary input; MIME header alone is insufficient.
   - Core touchpoints: `src/app/api/candidates/upload-resume/route.ts`, `src/lib/services/extract-document-text.ts` (helper reuse where useful).

3. **Normalize org-scoped rate-limit keys (`org:user`) on mutation endpoints**
   - Why: Reduces noisy-neighbor starvation and creates predictable fairness model.
   - Core touchpoints: high-write routes in `src/app/api/**/route.ts`, key policy in `src/lib/security/rate-limit.ts`.

4. **Invalidate/recompute JD embedding after job description mutation**
   - Why: Prevents stale FitScore behavior after recruiter edits JD.
   - Core touchpoints: `src/app/api/jobs/[id]/route.ts`, `src/lib/services/embeddings.ts`.

5. **Add missing hard input bounds (length/size) on freeform auth/profile fields**
   - Why: Cheapest defensive control against oversized payload abuse.
   - Core touchpoints: `src/lib/validations/auth.ts`, `src/lib/validations/candidates.ts`, related route schemas.

6. **Account lockout/backoff and password-reset cooldown**
   - Why: Improves brute-force and reset-flood resilience beyond generic rate limits.
   - Core touchpoints: `src/app/api/auth/login/route.ts`, `src/app/api/auth/forgot-password/route.ts`.

7. **Add CSRF double-submit token on mutating auth-sensitive routes**
   - Why: Defense-in-depth beyond Origin/Referer-only checks.
   - Core touchpoints: `src/lib/security/csrf.ts`, mutating `src/app/api/**/route.ts`.

8. **Add loading/suspense boundaries on highest-traffic recruiter pages**
   - Why: Largest perceived-speed improvement for preview demos.
   - Core touchpoints: `src/app/(dashboard)/recruit/jobs/[id]`, `src/app/(dashboard)/recruit/candidates/[id]`, `src/app/(dashboard)/dashboard/home`.

9. **Tune Anthropic retry policy for 429 backoff behavior**
   - Why: Circuit breaker exists, but 429 handling can still degrade under provider pressure.
   - Core touchpoints: `src/lib/utils/retry.ts`, `src/lib/services/anthropic.ts`.

10. **Connection-pooling readiness check and explicit runtime documentation**
    - Why: Cron + interactive load can pressure DB connections during preview spikes.
    - Core touchpoints: env/config docs and Supabase connection guidance.

Removed from prior top-10 as already addressed:

- "Circuit breaker on Anthropic calls" (already present).
- "Verify OAuth domain whitelist enforcement" (already enforced in callback flow).

## 3) Five-Day Implementation Slice (Concrete)

Scope fixed to the 4 mandated items:

- cron lock
- upload hardening
- rate-limit key normalization
- JD embedding invalidation

### Day 1 - Cron Lock Foundation

- Add migration for cron lease table (for example `cron_job_lock`) with:
  - `job_name` PK
  - `lease_owner`, `lease_expires_at`, `updated_at`
  - helper function to atomically acquire/renew lease (`upsert where expired or owned`)
- Add lock utility in `src/lib/security` or `src/lib/cron`.
- Wire lock acquire/release into `src/app/api/cron/score-batch/route.ts`.
- Behavior: if lock not acquired, return success-ish skip payload (`{ skipped: true, reason: "lock-held" }`) to avoid false alarms.

### Day 2 - Upload Hardening

- In `src/app/api/candidates/upload-resume/route.ts`:
  - Keep existing size cap.
  - Add extension normalization and deny unknown/ambiguous extensions.
  - Sniff magic bytes for PDF/DOC/DOCX/TXT and compare to declared type.
  - Reject mismatches with `400` and structured error.
- Add unit tests for MIME mismatch and oversized payload rejection in `tests/unit/candidates-upload-resume-route.test.ts`.

### Day 3 - Rate-Limit Key Normalization

- Define explicit key policy:
  - Org-scoped authenticated mutation route: `${route}:${orgId}:${userId}`
  - User-only fallback when org absent: `${route}:${userId}`
  - Public endpoints stay IP/token keyed.
- Update high-impact mutation endpoints first (auth-protected write APIs).
- Add regression tests for key shape where route tests already exist.

### Day 4 - JD Embedding Invalidation On Mutation

- In `src/app/api/jobs/[id]/route.ts` PATCH flow:
  - Detect JD-relevant field changes (`title`, `description`, `skills`, etc.).
  - Trigger `embedJob(id)` (sync or queued) after successful update.
  - Add safe fallback: if embedding fails, log and mark stale state for retry (avoid failing the user edit).
- Add targeted tests:
  - embedding triggered when JD fields change
  - not triggered for unrelated metadata changes.

### Day 5 - Stabilization + Verification

- Run focused tests:
  - cron route tests
  - upload route tests
  - updated rate-limit route tests
  - jobs PATCH embedding tests
- Verify no new lint errors on touched files.
- Publish post-change audit delta with:
  - what was fixed
  - residual risks (e.g., AV scanning if still deferred)
  - expected rating movement.

## Exit Criteria

- Cron overlap prevented for `score-batch`.
- Upload route rejects forged MIME/extension mismatches.
- Org-scoped write routes no longer rely on inconsistent key strategy.
- JD updates no longer leave stale semantic matching state.
- Tests and lint pass for touched areas.

## 4) Code-Verified Top-10 Baseline (2026-04-20)

This section freezes a file-level baseline before the full 30-day rollout.

| Top-10 Item                                              | Baseline Status                                       | Evidence                                                                                                                                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Cron lease/mutex for long-running cron jobs           | Implemented (core), test coverage pending             | `src/lib/security/cron-lease.ts`, `src/app/api/cron/score-batch/route.ts`, `supabase/migrations/20260420123000_cron_job_leases.sql`                                                           |
| 2. Upload trust hardening with server-side sniffing      | Implemented (core), adversarial tests pending         | `src/app/api/candidates/upload-resume/route.ts`, `tests/unit/candidates-upload-resume-route.test.ts`                                                                                          |
| 3. Org-scoped rate-limit key normalization               | Partially implemented                                 | `src/lib/security/rate-limit.ts`, selected routes using `buildScopedRateLimitKey`                                                                                                             |
| 4. JD embedding invalidation after mutation              | Implemented (core), targeted regression tests pending | `src/app/api/jobs/[id]/route.ts`                                                                                                                                                              |
| 5. Hard input bounds on freeform auth/profile fields     | Partially implemented                                 | `src/lib/validations/auth.ts`, `src/lib/validations/candidates.ts`                                                                                                                            |
| 6. Account lockout + password-reset cooldown             | Implemented (core), observability assertions pending  | `src/lib/security/auth-throttle.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/forgot-password/route.ts`, `supabase/migrations/20260420131500_auth_lockout_and_reset_cooldown.sql` |
| 7. CSRF double-submit token for auth-sensitive mutations | Not implemented                                       | `src/lib/security/csrf.ts` (Origin/Referer-only)                                                                                                                                              |
| 8. Loading/suspense boundaries on recruiter-heavy pages  | Not implemented                                       | `src/app` currently has three `loading.tsx` boundaries                                                                                                                                        |
| 9. Anthropic retry policy tuned for 429/backoff          | Partially implemented                                 | `src/lib/utils/retry.ts`, `src/lib/utils/resilient-call.ts`, `src/lib/services/anthropic.ts`                                                                                                  |
| 10. Connection pooling readiness + runtime docs          | Partially implemented                                 | Docs exist but no focused checklist tied to scoring+cron pressure                                                                                                                             |

## 5) Cron Lease Operations Runbook (`score-batch`)

### Runtime behavior

- Route: `POST /api/cron/score-batch`
- Lock primitive: `acquire_cron_lease()` / `release_cron_lease()` via `public.cron_job_locks`
- Normal overlap behavior: second runner returns `200` with `{ skipped: true, reason: "lock-held" }`

### Quick checks

- Inspect active leases:
  - `select job_name, lease_owner, lease_expires_at, updated_at from public.cron_job_locks order by updated_at desc;`
- Confirm cron heartbeat/audit:
  - `select id, job_name, status, created_at, finished_at from public.cron_runs where job_name = 'score-batch' order by created_at desc limit 20;`

### Manual unlock (only when runner is confirmed dead)

- Safety pre-check:
  - verify no in-flight run for the same `lease_owner` in logs/cron telemetry.
- Unlock query:
  - `delete from public.cron_job_locks where job_name = 'score-batch' and lease_expires_at <= timezone('utc', now());`
- If emergency override is needed (stale lock but expiry clock drift):
  - `delete from public.cron_job_locks where job_name = 'score-batch';`

### Post-unlock verification

- Trigger one cron run.
- Verify exactly one active lock row during execution, then no row after completion.
- Verify `cron_runs` row closes as `success` or `failure` with `finished_at` set.

## 6) Connection Pooling Readiness Checklist

This checklist is the operational baseline for preview/launch traffic when interactive routes and cron jobs overlap.

### Hot-path routes to watch

- `POST /api/cron/score-batch`
- `POST /api/fit-score`
- `POST /api/fitscore/score`
- `POST /api/fitscore/batch`
- `POST /api/candidates/upload-resume`

### Runtime guardrails

- Keep cron overlap protection enabled via `public.cron_job_locks`.
- Prefer async queueing for larger scoring workloads to flatten DB burst pressure.
- Ensure connection usage is observable in Supabase dashboards (active connections, wait events, slow queries).
- Keep rate limits enabled on high-write APIs to reduce burst fan-out against Postgres.

### Incident triage sequence

1. Confirm whether concurrent cron executions occurred (`cron_job_locks`, `cron_runs`).
2. Check DB pressure and slow query traces for hot routes.
3. Shift batch scoring to queued mode and reduce inline candidate batch size if needed.
4. Retry deferred scoring once provider/API health normalizes.
5. Record timeline and mitigation in the launch incident log.

## 7) Top-10 Delta After Implementation Pass

| Top-10 Item                         | Status After This Pass                    | Notes                                                                            |
| ----------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| Cron lease/mutex                    | Completed                                 | Lease + route wiring + focused tests in place.                                   |
| Upload trust hardening              | Completed                                 | Content sniffing + mismatch tests added.                                         |
| Org-scoped rate-limit normalization | Completed (high-impact mutation routes)   | Added helper usage across core write paths and auth-sensitive integrations.      |
| JD embedding invalidation           | Completed                                 | Existing implementation validated and retained.                                  |
| Input bounds hardening              | Completed (auth/profile-critical schemas) | Added stricter trims/max bounds in contact/candidate/org validation surfaces.    |
| Account lockout/reset cooldown      | Completed                                 | Existing controls retained; route tests strengthened.                            |
| CSRF double-submit token            | Completed (auth-sensitive rollout)        | Added token issuance route + enforced token checks on auth mutation endpoints.   |
| Recruiter loading boundaries        | Completed                                 | Added loading boundaries on recruiter home, job detail, candidate detail routes. |
| Anthropic retry 429/backoff         | Completed                                 | Retry classifier and delay strategy now handle 429/retry-after patterns.         |
| Connection-pooling readiness docs   | Completed                                 | Operational checklist and incident sequence documented above.                    |

### CSRF rollout toggle

- Auth-route double-submit enforcement is controlled by `CSRF_DOUBLE_SUBMIT_ENFORCE_AUTH`.
- Enable with `true` (or `1/yes/on`) to enforce header+cookie checks on:
  - `POST /api/auth/login`
  - `POST /api/auth/register`
  - `POST /api/auth/forgot-password`
- Auth UI clients now fetch `/api/auth/csrf-token` and send `x-csrf-token` automatically.
- When enforcement is enabled, auth routes run a once-per-instance issuer probe and log a warning if `/api/auth/csrf-token` is unreachable.
- CSRF rejections are logged with structured reason keys (`missing_csrf_token`, `token_mismatch`) for rapid incident triage.
- Counter metrics now emit with low-cardinality labels (`route`, `reason`) only:
  - `auth_request_total{route}`
  - `auth_csrf_reject_missing_token{route,reason}`
  - `auth_csrf_reject_token_mismatch{route,reason}`
  - `auth_csrf_token_issued_total`
- Rollout panel query (15m window, per route): `(reject_missing + reject_mismatch) / request_total`.
- Alerting guideline after flag enablement warm-up (about 1 hour): sustained rejection rate `>2%` indicates likely client/deploy skew.
- Internal rollout monitor endpoint: `GET /api/health/csrf` (append `?probe=1` to verify issuer reachability).

### CSRF rollout execution checklist

- **T-0 (pre-flip, flag off):**
  - Confirm `/api/health/csrf` returns `ok: true` and expected `enforceAuthCsrf` state.
  - Confirm metrics emission path is live: `auth_request_total` increments on auth traffic while reject counters stay near zero.
  - Verify token issuer health with `GET /api/health/csrf?probe=1` before enabling enforcement.
- **Flag flip hour (enable `CSRF_DOUBLE_SUBMIT_ENFORCE_AUTH=true`):**
  - Notify on-call to watch per-route 15m rejection-rate panel: `(reject_missing + reject_mismatch) / request_total`.
  - Expect short-lived in-flight blip (roughly `0.1%-0.5%`) and recovery within minutes.
  - If sustained spike appears, compare rejection-rate vs `auth_csrf_token_issued_total` trend to isolate issuer outage vs client-header mismatch.
- **T+1 hour:**
  - Target steady-state rejection rate `<0.5%`; investigate any sustained `>1%` immediately as rollout skew or stale-client issue.
  - Keep route-level breakdown (`login`, `register`, `forgot-password`) to identify affected user flow quickly.
- **T+24 hours:**
  - Remove temporary rollout paging alert if stable; retain baseline dashboard panel for ongoing auth-abuse visibility.
  - Capture incident notes or anomalies for post-rollout review.
- **T+7 days:**
  - Schedule and execute rollout-flag cleanup (`CSRF_DOUBLE_SUBMIT_ENFORCE_AUTH`) so it does not become permanent control debt.
  - Owner: Platform Security (DRI) — due 7 days after first production flag enablement.
  - Decide explicitly whether to retain an emergency break-glass kill-switch helper for CSRF enforcement.
- **On-call linkage verification:**
  - Confirm this runbook is linked from PagerDuty runbook notes and the auth/security wiki page.
  - Record verification date + owner in release handoff notes.

## 8) Quick-to-Hard Execution Wave (2026-04-21)

Execution completed in strict wave order (quick wins -> reliability -> intelligence -> hard security) with focused verification after each wave.

### Additional implementation updates from this wave

- Added Vitest-safe `server-only` mock in `tests/setup.ts` so route tests can import server modules in test runtime.
- Added JD bias route coverage in `tests/unit/jobs-bias-route.test.ts`:
  - unauthenticated rejection (`401`)
  - empty-JD guard (`400`)
  - successful normalization of model output (`200`)
- Hardened CSRF token route assertion in `tests/unit/csrf-token-route.test.ts` to verify both payload and `set-cookie` semantics.

### Verification gate result

- Combined multi-wave suite executed successfully:
  - `16` test files
  - `66` tests passed
  - `0` failed
- Scope included:
  - quick-win UI/notes/intelligence tests
  - reliability routes (`pipeline/bulk`, `whatsapp/flow-status`, `intake/email`, `usage/summary`, compliance)
  - intelligence route (`jobs/[id]/bias`)
  - hard-security/auth/CSRF/FitScore/DLQ suites

### Operational note

- Added `server-only` dependency to support consistent server-module resolution in route test execution contexts.
