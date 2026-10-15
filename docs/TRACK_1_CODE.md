# Track 1: Code — Subagent Work Plan

> **Owner:** Code subagent(s)
> **Priority:** P0–P2
> **Pending tasks:** ~50
> **Depends on:** Codebase access only (no external accounts needed)

---

## TASK 1.1 — Email Preferences Enforcement (P1)

**Goal:** Every email-sending function must check the recipient's `email_preferences` row before sending.

### Context

- Email service: `src/lib/services/resend.ts` — 9 exported functions
- Email preferences API: `src/app/api/email-preferences/route.ts`
- Preference columns: `marketing`, `job_alerts`, `application_updates`, `messages`, `interview_reminders`, `weekly_digest`
- DB table: `email_preferences` (has `user_id` FK)
- Admin client (bypasses RLS): `src/lib/supabase/admin.ts` → `createSupabaseAdmin()`

### Steps

1. Create a helper in `src/lib/services/resend.ts`:

```typescript
async function shouldSendEmail(
  recipientEmail: string,
  category:
    | "marketing"
    | "job_alerts"
    | "application_updates"
    | "messages"
    | "interview_reminders"
    | "weekly_digest",
): Promise<boolean>;
```

- Use the admin client to look up `email_preferences` by joining through `profiles.email`
- Return `true` if no row exists (default to opted-in)
- Return `false` if the relevant flag is `false`

2. Map each email function to its preference category:

| Function                              | Category                      |
| ------------------------------------- | ----------------------------- |
| `sendMatchAlert`                      | `job_alerts`                  |
| `sendFitScoreReady`                   | `application_updates`         |
| `sendInviteEmail`                     | (always send — transactional) |
| `sendApplicationWithdrawnToRecruiter` | `application_updates`         |
| `sendInterviewBooked`                 | `interview_reminders`         |
| `sendInterviewCancelled`              | `interview_reminders`         |
| `sendInterviewRescheduled`            | `interview_reminders`         |
| `sendContactNotification`             | (always send — internal)      |

3. Add the `shouldSendEmail` guard to each function (except transactional/internal)
4. Return `{ skipped: true, reason: 'email_preference_disabled' }` when suppressed so callers can log it

### Test

- Add tests in `tests/unit/` for `shouldSendEmail` with mocked Supabase
- Verify that `sendInterviewBooked` is suppressed when `interview_reminders = false`
- Verify that `sendInviteEmail` always sends regardless of preferences

### Acceptance

- [ ] `shouldSendEmail` helper created and tested
- [ ] All 6 non-transactional send functions gated
- [ ] Existing tests still pass (`npm run test`)

---

## TASK 1.2 — Testing & Coverage (P1)

**Goal:** Reach 30% coverage (Week 2), then 50% (Week 3), then 70% (Week 5).

### Context

- Test runner: Vitest — `vitest.config.ts`
- Current thresholds: 15% lines, 14% branches, 12% functions
- Existing unit tests: `tests/unit/` (46 files)
- Existing integration tests: `tests/integration/` (2 files)
- Existing E2E: `e2e/` (3 Playwright specs: auth-flow, dashboard-navigation, public-pages)
- Path alias: `@` → `./src`
- Commands: `npm run test`, `npm run test:coverage`, `npm run test:e2e`

### Sub-task 1.2a — E2E: Scheduling Flow

Create `e2e/scheduling-flow.spec.ts`:

- Navigate to a job's scheduling page
- Select an availability slot
- Book an interview
- Verify confirmation UI
- Cancel the interview
- Verify cancellation UI

### Sub-task 1.2b — E2E: Messaging Flow

Create `e2e/messaging-flow.spec.ts`:

- Open conversation list
- Select a conversation
- Send a message
- Verify message appears in list
- Test real-time delivery (if feasible)

### Sub-task 1.2c — Integration Tests: Messaging

Create `tests/integration/messaging.test.ts`:

- Test `POST /api/messages/[conversationId]` with valid body
- Test `GET /api/messages/[conversationId]` returns messages
- Test `GET /api/messages` returns conversations with unreadCount
- Test unauthorized access returns 401

### Sub-task 1.2d — Integration Tests: Cross-Feature

Create `tests/integration/cross-feature.test.ts`:

- Test pipeline stage move → application status sync
- Test interview book → email sent
- Test feedback submission → aggregate recalculation

### Sub-task 1.2e — Security Tests

Create `tests/unit/security-auth.test.ts`:

- Test all protected routes reject unauthenticated requests
- Test RBAC: candidate cannot access recruiter-only endpoints
- Test CSRF protection on mutating endpoints
- Test rate limiting triggers correctly

### Sub-task 1.2f — Edge Case Tests

Add edge case tests to existing test files:

- Empty pipeline stages → returns empty array, not error
- Feedback with no template → 400 error
- Resume delete on default version → 400 error
- Concurrent message sends → no duplicates

### Sub-task 1.2g — Coverage Milestones

After each batch, bump `vitest.config.ts` thresholds:

| Milestone    | lines | branches | functions | statements |
| ------------ | ----- | -------- | --------- | ---------- |
| Week 2 (30%) | 30    | 28       | 25        | 30         |
| Week 3 (50%) | 50    | 45       | 40        | 50         |
| Week 5 (70%) | 70    | 65       | 60        | 70         |

### Acceptance

- [ ] `npm run test:e2e` passes with 2 new specs
- [ ] `npm run test` passes with new integration and unit tests
- [ ] Coverage at or above current sprint target

---

## TASK 1.3 — PWA Support (P2)

**Goal:** Make the app installable as a PWA with offline support.

### Context

- Framework: Next.js 16.1.6 (App Router)
- No existing `manifest.json` or service worker
- Public directory: `public/`
- Layout root: `src/app/layout.tsx`

### Steps

1. **Install `next-pwa`** (or `@ducanh2912/next-pwa` for App Router support):

```bash
npm install @ducanh2912/next-pwa
```

2. **Create `public/manifest.json`:**

```json
{
  "name": "TigerHire",
  "short_name": "TigerHire",
  "description": "AI-powered recruitment platform",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#f97316",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

3. **Update `next.config.ts`** to wrap with PWA plugin
4. **Add `<link rel="manifest">` to `src/app/layout.tsx`**
5. **Configure caching strategy:** NetworkFirst for API routes, CacheFirst for static assets
6. **Add install prompt component** in `src/components/dashboard/InstallPrompt.tsx`
7. **Test:** Verify Lighthouse PWA score, test on iOS Safari and Android Chrome

### Acceptance

- [ ] `manifest.json` in `public/`
- [ ] Service worker generated on build
- [ ] Install prompt shown for eligible browsers
- [ ] Offline fallback page works
- [ ] Lighthouse PWA audit passes

---

## TASK 1.4 — Load Testing (P1)

**Goal:** Set up k6 and run load tests for critical API paths.

### Steps

1. **Install k6** (system-level, not npm):

```bash
# Windows: winget install k6 --source winget
# Or: choco install k6
```

2. **Create `load-tests/` directory** with these scripts:

| File                               | What it tests            | Target                               |
| ---------------------------------- | ------------------------ | ------------------------------------ |
| `load-tests/auth-flow.js`          | Login + session creation | `POST /api/auth/login`               |
| `load-tests/job-listing.js`        | Browse jobs              | `GET /api/jobs`                      |
| `load-tests/application-submit.js` | Submit application       | `POST /api/applications`             |
| `load-tests/messaging.js`          | Send/receive messages    | `GET/POST /api/messages/[id]`        |
| `load-tests/analytics.js`          | Dashboard data           | `GET /api/analytics?metric=overview` |

3. **Each script should:**
   - Ramp up to 500 virtual users over 2 minutes
   - Sustain for 5 minutes
   - Ramp down over 1 minute
   - Assert p95 latency < 500ms, error rate < 1%

4. **Add npm scripts:**

```json
"test:load": "k6 run load-tests/job-listing.js",
"test:load:all": "k6 run load-tests/auth-flow.js && k6 run load-tests/job-listing.js && k6 run load-tests/application-submit.js && k6 run load-tests/messaging.js && k6 run load-tests/analytics.js"
```

5. **Document results** in `docs/LOAD_TEST_RESULTS.md`

### Acceptance

- [ ] `load-tests/` directory with 5 scripts
- [ ] Scripts run successfully against local or staging
- [ ] Results documented with p50/p95/p99 latencies and error rates

---

## TASK 1.5 — Performance Optimization (P1)

**Goal:** Identify and fix slow queries, add indexes, optimize API response times.

### Context

- DB: Supabase (PostgreSQL)
- Caching: Upstash Redis (`src/lib/redis/`)
- Repositories: `src/lib/repositories/` (10 files)
- Existing cache layer: `src/lib/redis/cache.ts`

### Steps

1. **Identify slow queries:**
   - Enable `pg_stat_statements` in Supabase dashboard
   - Run `SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20`
   - Check all repository files for N+1 queries or missing `.select()` constraints

2. **Add indexes** — create a new migration in `supabase/schema/`:
   - `applications(job_id, status)` — used by analytics pipeline query
   - `messages(conversation_id, created_at)` — used by cursor pagination
   - `pipeline_candidates(job_id, stage_id)` — used by pipeline board
   - `email_preferences(user_id)` — used by new preference checks

3. **Optimize API response times:**
   - Add Redis caching to `GET /api/analytics` (TTL 5 min)
   - Add Redis caching to `GET /api/jobs` listing (TTL 2 min)
   - Use `.select()` to limit columns returned in repository queries

4. **Cache warming:**
   - Add `src/lib/redis/warm.ts` that pre-populates analytics and job listing caches
   - Call from `src/app/api/cron/` on a schedule

5. **Document** in `docs/PERFORMANCE_IMPROVEMENTS.md`

### Acceptance

- [ ] Slow queries identified and documented
- [ ] Migration file with new indexes created
- [ ] At least 2 API routes have Redis caching
- [ ] Cache warming function created
- [ ] Performance doc written

---

## TASK 1.6 — Bug Fixes & QA (P1)

**Goal:** Triage bugs, fix UI/UX issues, mobile responsiveness, accessibility.

### Steps

1. **Triage:** Run the app and audit all dashboard pages for:
   - Broken layouts on mobile (< 768px)
   - Missing aria labels, poor contrast ratios
   - Console errors
   - Missing loading/error states

2. **Fix mobile responsiveness:**
   - Check all pages in `src/app/(dashboard)/`
   - Ensure sidebar collapses properly
   - Ensure tables use horizontal scroll on mobile
   - Ensure modals/dialogs are mobile-friendly

3. **Fix accessibility:**
   - All interactive elements have keyboard focus styles
   - All images have alt text
   - Form inputs have associated labels
   - Color contrast meets WCAG AA (4.5:1 for text)

4. **Cross-browser testing:**
   - Chrome, Firefox, Safari, Edge
   - Document any browser-specific issues

### Acceptance

- [ ] No console errors on any page
- [ ] All dashboard pages responsive at 375px, 768px, 1024px, 1440px
- [ ] Lighthouse accessibility score ≥ 90 on key pages
- [ ] Cross-browser report documented

---

## TASK 1.7 — P2 Features (If Time)

### 1.7a Job Alert Customization UI

- Add UI in `src/app/(dashboard)/candidate/saved-searches/` to customize alert frequency, preferred locations, salary range
- Uses `PATCH /api/saved-searches/[id]`

### 1.7b Email Template Improvements

- Refactor inline HTML in `src/lib/services/resend.ts` into reusable template functions
- Add consistent header/footer to all emails
- Add unsubscribe links pointing to `/api/email-preferences`

### 1.7c Additional Analytics Widgets

- Add "Applications Over Time" chart (line chart, last 30 days)
- Add "Candidate Location Map" widget
- Uses `GET /api/analytics?metric=...` — may need new metric types in backend

### Acceptance

- [ ] Alert customization UI functional
- [ ] Email templates refactored with shared layout
- [ ] At least 1 new analytics widget added

---

## TASK 1.8 — Code Freeze & Release Engineering (P0)

_Execute March 30–31 only_

### Steps

1. Announce code freeze in team channel
2. `git log --oneline --since="2026-03-20"` — review all recent commits
3. Merge all approved PRs to `main`
4. `git checkout -b release/v1.0.0`
5. `git tag v1.0.0-rc.1`
6. Push branch and tag

### Acceptance

- [ ] Release branch exists
- [ ] RC tag pushed
- [ ] No unapproved PRs remain

---

## TASK 1.9 — Final Security Scan (P0)

_Execute March 30–31 only_

### Steps

1. `npm audit` — fix all critical/high
2. `npx snyk test` (if Snyk configured)
3. Check `next.config.ts` for CSP headers
4. `git log --all --diff-filter=A -- '*.env*'` — verify no secrets committed
5. Cross-reference `src/lib/config/env.ts` against Vercel/production env vars

### Acceptance

- [ ] Zero critical/high vulnerabilities in `npm audit`
- [ ] CSP headers configured
- [ ] No secrets in git history
- [ ] All env vars documented

---

## TASK 1.10 — Production Deployment & Smoke Tests (P0)

_Execute April 1–2_

### Steps

1. Deploy to production (Vercel or configured host)
2. Run health check: `curl https://tigerhire.io/api/health`
3. Smoke tests:
   - Login with test account
   - Browse jobs
   - View analytics dashboard
   - Send a message
   - Book an interview
4. Enable feature flags for 10% rollout
5. April 2: remove flags for 100%

### Acceptance

- [ ] Production deployment successful
- [ ] All smoke tests pass
- [ ] Feature flags toggled correctly

---

## TASK 1.11 — Hotfix Readiness (P0)

### Steps

1. `git checkout -b hotfix/template` from release branch
2. Document hotfix process: branch → fix → PR → deploy
3. Test the deployment pipeline with a no-op change

### Acceptance

- [ ] Hotfix branch template exists
- [ ] Deployment pipeline tested with a dry-run

---

**End of Track 1 Plan**
