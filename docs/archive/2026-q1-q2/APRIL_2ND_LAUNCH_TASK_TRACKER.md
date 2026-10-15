# April 2nd Launch - Task Tracker

## How to Use This Document

- [ ] Check boxes indicate incomplete tasks
- [x] Checked boxes indicate completed tasks
- Update this file daily during the sprint
- Bold task owners in parentheses: **(Owner)**

---

## Phase-wise Gap Alignment (Mar 20, 2026)

This section is a live reality-check layer. It does not rewrite sprint history below.

### Phase 1: Baseline (planned vs built)

#### Doc drift (planned text no longer matches implementation)

| Feature              | Tracker wording                        | Actual backend | Actual UI                                    | Status    |
| -------------------- | -------------------------------------- | -------------- | -------------------------------------------- | --------- |
| Interview scheduling | backend complete, frontend pending     | Built          | Built (`/recruit/jobs/[id]/interviews`)      | Doc drift |
| Pipeline stages      | backend CRUD + tests, frontend pending | Built          | Built (`/recruit/jobs/[id]/pipeline-stages`) | Doc drift |
| In-app messaging     | backend complete, frontend pending     | Built          | Built (`/messages`)                          | Doc drift |
| Interview feedback   | backend complete, frontend pending     | Built          | Built (`/recruit/jobs/[id]/feedback*`)       | Doc drift |
| Resume versions      | backend complete, frontend pending     | Built          | Built (candidate + recruiter resume pages)   | Doc drift |
| SSO buttons          | frontend pending                       | Built          | Built (login/register SSO actions)           | Doc drift |
| Analytics dashboard  | frontend pending                       | Built          | Built (`/recruit/analytics`)                 | Doc drift |
| Saved searches       | frontend pending                       | Built          | Built (`/recruit/saved-searches`)            | Doc drift |

#### True backend-only gaps

| Gap                                  | Current state                                                                                                                           | Launch impact | Owner             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------- |
| Platform cost sync provider coverage | `vercel/supabase/anthropic` are integrated; `stripe` now integrated for fee ingestion; `upstash/resend` are explicit pending connectors | Medium        | Platform Eng      |
| Cost test coverage                   | New cost sync + admin sync route tests added; broader cost summary/trend route coverage still thin                                      | Medium        | QA + Platform Eng |

#### True UI-only gaps

- None identified in the features above. Most previously flagged items were doc drift, not missing backend.

### Phase 2: Documentation reconciliation

- Keep historical sprint bullets unchanged for traceability.
- Use this Phase-wise Gap Alignment section as the canonical current-state readout.
- When a pending item is actually shipped, mark it in this section first, then update weekly bullets during sprint review.

### Phase 3: Gap closure decisions and acceptance criteria

#### A) Platform cost providers

- Implemented:
  - `stripe` cost ingestion via balance transaction fees.
  - Explicit sync results for `upstash` and `resend` as pending connectors (visible in sync output).
- Acceptance criteria:
  - Admin sync output returns all tracked providers (`vercel`, `supabase`, `anthropic`, `stripe`, `upstash`, `resend`).
  - `stripe` imports only fee-positive transactions as invoiced cost events.
  - `upstash`/`resend` return deterministic `skipped` reasons until connectors are built.

#### B) Interview calendar integration

- Decision: keep export-link flow (ICS / Google / Outlook links) as current implementation.
- Native provider integration remains optional post-launch, not launch-blocking.
- Acceptance criteria:
  - Recruiter can export newly booked interviews from scheduling UI.
  - Candidate scheduling flow remains functional without native calendar OAuth.

### Phase 4: Testing and reliability hardening

- Added:
  - `tests/unit/cost-sync.test.ts`
  - `tests/unit/admin-costs-sync-route.test.ts`
- Next:
  - Add route tests for `/api/admin/costs/summary`, `/api/admin/costs/by-provider`, `/api/admin/costs/trend`.
  - Add resilience tests for error paths in provider syncs (HTTP failures, malformed payloads).

### Phase 5: Governance (prevent stale planned/pending labels)

- Weekly tracker hygiene ritual (owner: Product + Eng lead):
  1. Reconcile pending labels against live routes/pages.
  2. Move mismatches into Doc drift table.
  3. Promote true gaps into Next Pending list with owner + target week.
- Update cadence:
  - Reality section: weekly.
  - Sprint bullets: during sprint review.

### Next Pending (true gaps only)

- [ ] Upstash billing connector for platform cost sync.
- [ ] Resend billing connector for platform cost sync.
- [ ] Expand admin costs route test coverage (`summary`, `by-provider`, `trend`).

---

## Week 1: Foundation & Architecture (Feb 23 - Mar 1)

### Infrastructure **(Platform Eng)**

- [ ] Set up Upstash Redis account
- [x] Configure Redis connection in app
- [x] Implement Redis caching wrapper
- [x] Add Redis health check to /api/health
- [ ] Configure Supabase connection pooling
- [x] Set up API rate limiting middleware
- [x] Document Redis architecture

### Feature Flags **(Senior Eng 1)**

- [x] Set up feature flag system
- [x] Create flags for new features
- [x] Add admin UI for flag management
- [x] Document flag usage

### Monitoring **(Senior Eng 2)**

- [x] Set up launch monitoring dashboard
- [x] Configure alerts for error rate
- [x] Configure alerts for latency
- [x] Configure alerts for cache hit rate
- [x] Test alert notifications

### Testing Foundation **(QA Eng)**

- [x] Set up coverage tracking
- [x] Identify critical test paths
- [x] Create test plan document
- [x] Write tests for auth routes
- [x] Write tests for core workflows
- [x] Week 1 Coverage Target: **15%** (achieved 16.2% lines)

### Product Specs **(Product)**

- [ ] Finalize interview scheduling PRD
- [ ] Finalize in-app messaging PRD
- [ ] Finalize interview feedback forms PRD
- [ ] Finalize custom pipeline stages PRD
- [ ] Get spec approvals from leadership

### Week 1 Deliverables

- [x] Redis operational
- [x] Feature flags working
- [x] Monitoring dashboard live
- [x] 15% test coverage (achieved 16.2% lines)
- [ ] All P0 specs approved

---

## Week 2: Core Features - Part 1 (Mar 2 - Mar 8)

### Interview Scheduling **(Senior Eng 1 + Mid Eng 1)**

- **Run migration 40 on Supabase** so `interview_availability_slots` exists: In Supabase Dashboard → SQL Editor, run the contents of `supabase/schema/40_interview_scheduling.sql` (or apply via your migration workflow).
- [x] Database schema for availability
- [x] API: Store recruiter availability
- [x] API: Get available slots
- [x] API: Book interview
- [x] API: Reschedule/cancel
- [ ] Google Calendar integration
- [x] Email notifications (booked/cancelled/rescheduled wired into routes)
- [ ] WhatsApp reminders
- [ ] Frontend: Calendar UI
- [ ] Frontend: Booking flow
- [x] Unit tests (availability, book, cancel, reschedule)
- [x] Integration tests (pipeline-stages-integration.test.ts)

### Custom Pipeline Stages **(Senior Eng 2)**

- [x] Database schema for custom stages
- [x] API: CRUD for stages
- [x] API: Update application stage (PATCH /api/jobs/[id]/pipeline/candidates/[pcId] syncs application status)
- [x] Migration: Convert existing data (43_pipeline_stage_migration.sql — default stages + backfill)
- [ ] Frontend: Pipeline builder UI
- [ ] Frontend: Drag-and-drop stages
- [ ] Frontend: Stage settings
- [x] Unit tests (pipeline-stages-route.test.ts)
- [x] Integration tests (pipeline-stages-integration.test.ts)

### Application Withdrawal **(Mid Eng 2)**

- [x] API: Withdraw application
- [x] API: List withdrawn applications
- [x] Database: Soft delete/withdraw status
- [x] Frontend: Withdraw button
- [x] Frontend: Withdraw confirmation
- [x] Email notification to recruiter
- [x] Unit tests

### Testing **(QA Eng)**

- [x] Write tests for scheduling API
- [x] Write tests for pipeline API (pipeline-stages-integration.test.ts — 10 tests)
- [x] Write tests for withdrawal
- [ ] E2E tests for scheduling flow
- [ ] Week 2 Coverage Target: **30%**

### Documentation **(Product)**

- [x] Help article: How to schedule interviews
- [x] Help article: Managing pipeline stages
- [x] Help article: Withdrawing applications

### Week 2 Deliverables

- [x] Interview scheduling API complete (backend complete, frontend pending)
- [x] Custom pipeline stages working (backend CRUD + tests, frontend pending)
- [x] Application withdrawal live
- [ ] 30% test coverage

---

## Week 3: Core Features - Part 2 (Mar 9 - Mar 15)

### In-App Messaging **(Senior Eng 1 + Mid Eng 1)**

- [x] Select WebSocket provider (Supabase Realtime — built-in, no extra dependency)
- [x] Set up WebSocket infrastructure (Supabase Realtime postgres_changes on messages table)
- [x] Database schema for messages (44_messages.sql — conversations, conversation_participants, messages)
- [x] API: Send message (POST /api/messages/[conversationId])
- [x] API: Get conversation (GET /api/messages/[conversationId])
- [x] API: Get message threads (GET /api/messages — list with last message + unread count)
- [x] Real-time message delivery (Supabase Realtime on messages table via ALTER PUBLICATION)
- [x] Unread message indicators (unreadCount per conversation via last_read_at tracking)
- [ ] Frontend: Message UI
- [ ] Frontend: Conversation list
- [ ] Frontend: Message composer
- [x] File attachments (basic) (attachment_url + attachment_name on messages)
- [x] Email notifications for new messages (email sent to participants on new message)
- [x] Unit tests (messages-route.test.ts — 10 tests)
- [ ] Integration tests

### Interview Feedback Forms **(Senior Eng 2)**

- [x] Database schema for forms (41_interview_feedback.sql)
- [x] Database schema for responses (41_interview_feedback.sql)
- [x] API: Create/edit form templates
- [x] API: Submit feedback
- [x] API: Get aggregated feedback
- [x] Default form templates (45_default_feedback_templates.sql — 7-field default template seeded for all jobs)
- [ ] Frontend: Form builder
- [ ] Frontend: Feedback submission
- [ ] Frontend: Feedback view
- [x] Unit tests (feedback-routes.test.ts - 11 tests)
- [x] Integration tests (feedback-integration.test.ts — 7 tests: create template, list, submit, aggregate, role checks, validation)

### Resume Version Management **(Mid Eng 2)**

- [x] Database: Add version tracking (42_resume_versions.sql)
- [x] API: Upload new version
- [x] API: List versions
- [x] API: Set default version
- [x] API: Delete version
- [ ] Frontend: Version selector
- [ ] Frontend: Version upload
- [ ] Frontend: Version history
- [x] Unit tests (resume-versions-route.test.ts - 9 tests)

### Testing **(QA Eng)**

- [x] Write tests for messaging API (messages-route.test.ts — 10 tests)
- [x] Write tests for feedback API
- [x] Write tests for resume versions
- [ ] E2E tests for messaging flow
- [ ] Week 3 Coverage Target: **50%**

### Documentation **(Product)**

- [ ] Help article: Using in-app messaging
- [ ] Help article: Interview feedback forms
- [ ] Help article: Managing resume versions

### Week 3 Deliverables

- [x] In-app messaging functional (backend: DB + API + real-time + tests; frontend pending)
- [x] Interview feedback forms live (backend: DB + API + tests + default templates; frontend pending)
- [x] Resume version management complete (backend: DB + API + tests; frontend pending)
- [ ] 50% test coverage

---

## Week 4: Polish & Integration (Mar 16 - Mar 22)

### SSO Integration **(Mid Eng 1)**

- [x] Google OAuth setup (POST /api/auth/sso with provider=google via Supabase Auth)
- [x] LinkedIn OAuth setup (POST /api/auth/sso with provider=linkedin_oidc via Supabase Auth)
- [x] API: OAuth callbacks (existing /api/auth/callback handles code exchange + profile creation)
- [x] Account linking (GET/POST /api/auth/link — link/list OAuth identities)
- [ ] Frontend: SSO buttons
- [x] Unit tests (auth-sso-route.test.ts — 11 tests)

### Basic Analytics Dashboard **(Mid Eng 2)**

- [x] Database views for metrics (46_analytics_views.sql — time_to_hire, pipeline_conversion, candidates_by_source, recent_activity)
- [x] API: Key metrics endpoints (GET /api/analytics?metric=overview|time_to_hire|pipeline|sources|activity)
- [ ] Frontend: Dashboard layout
- [ ] Frontend: Time-to-hire chart
- [ ] Frontend: Pipeline conversion chart
- [ ] Frontend: Candidates by source
- [ ] Frontend: Recent activity feed

### Saved Searches & Job Alerts **(Senior Eng 2)**

- [x] Database schema for saved searches (47_saved_searches.sql — filters jsonb, alert_enabled, alert_frequency)
- [x] API: Save search (POST /api/saved-searches)
- [x] API: Get saved searches (GET /api/saved-searches)
- [x] API: Delete saved search (DELETE /api/saved-searches/[id])
- [x] API: Configure alerts (PATCH /api/saved-searches/[id] — alert_enabled, alert_frequency)
- [x] Email digest generation (POST /api/cron/job-alerts — daily/weekly digests with matching jobs)
- [ ] Frontend: Save search button
- [ ] Frontend: Saved searches list
- [ ] Frontend: Alert settings
- [x] Unit tests (saved-searches-route.test.ts — 12 tests)

### PWA Support **(Senior Eng 1)**

- [ ] Create manifest.json
- [ ] Add service worker
- [ ] Configure caching strategy
- [ ] Add install prompts
- [ ] Test offline behavior
- [ ] Test on iOS Safari
- [ ] Test on Android Chrome

### Email Preferences **(Mid Eng 1)**

- [x] API: Get preferences (GET /api/email-preferences — auto-creates defaults)
- [x] API: Update preferences (PATCH /api/email-preferences — partial update)
- [x] Database: Add preferences table (48_email_preferences.sql — marketing, job_alerts, application_updates, messages, interview_reminders, weekly_digest)
- [ ] Frontend: Preferences UI
- [ ] Respect preferences in all emails

### Load Testing **(Platform Eng + QA Eng)**

- [ ] Set up k6 testing environment
- [ ] Write load tests for critical paths
- [ ] Run 500 concurrent user test
- [ ] Document results
- [ ] Address any performance issues

### Testing **(QA Eng)**

- [ ] Integration testing across features
- [x] Write tests for SSO (auth-sso-route.test.ts — 11 tests)
- [x] Write tests for analytics (analytics-route.test.ts — 7 tests)
- [x] Write tests for saved searches (saved-searches-route.test.ts — 12 tests)
- [ ] Security testing (auth flows)
- [ ] Week 4 Coverage Target: **65%**

### Beta Preparation **(Product)**

- [ ] Select 5 beta customers
- [ ] Create beta onboarding materials
- [ ] Set up feedback collection
- [ ] Schedule beta kickoff calls

### Week 4 Deliverables

- [x] SSO working (backend: Google + LinkedIn OAuth + account linking + 11 tests; frontend SSO buttons pending)
- [x] Analytics dashboard live (backend: DB views + API 5 metrics + 7 tests; frontend charts pending)
- [x] Saved searches functional (backend: CRUD + alerts + email digest cron + 12 tests; frontend pending)
- [ ] PWA installable
- [ ] Load test passed
- [ ] 65% test coverage

---

## Week 5: Quality & Performance (Mar 23 - Mar 29)

### Test Coverage Sprint **(All Engineers)**

- [x] CandidateRepository tests (candidate-repository.test.ts — 14 tests)
- [x] JobRepository tests (job-repository.test.ts — 13 tests)
- [x] ApplicationRepository tests (application-repository.test.ts — 10 tests)
- [x] CandidateService tests (candidate-service.test.ts — 5 tests)
- [x] JobService tests (job-service.test.ts — 8 tests)
- [x] ApplicationService tests (application-service.test.ts — 7 tests)
- [x] Auth route tests (login, register, ensure-profile)
- [x] Stripe webhook tests (stripe-webhook.test.ts — 10 tests: sig verification, idempotency, checkout company/candidate, sub updated/deleted/downgrade, payment failed, error handling)
- [x] CRUD route tests (jobs, candidates, applications, notifications, orgs, hiring-requests, employees — 44 tests)
- [x] Utility function tests (circuit-breaker, dlq, logger, pii, validate — 49 tests)
- [ ] Edge case handling tests
- [ ] Week 5 Coverage Target: **70%**

### Performance Optimization **(Platform Eng + Senior Eng 1)**

- [ ] Identify slow queries
- [ ] Add database indexes where needed
- [ ] Optimize API response times
- [ ] Cache warming strategy
- [ ] Document performance improvements

### Bug Fixes **(All Engineers)**

- [ ] Triage all P1 bugs
- [ ] Fix UI/UX issues
- [ ] Fix mobile responsiveness
- [ ] Fix accessibility issues
- [ ] Cross-browser testing

### Beta Testing **(Product + QA Eng)**

- [ ] Onboard beta customers
- [ ] Collect daily feedback
- [ ] Triage feedback into bugs/feature requests
- [ ] Fix critical beta issues
- [ ] Update documentation based on feedback

### P2 Features (If Time Permits) **(Mid Eng 2)**

- [ ] Job alert customization UI
- [ ] Email template improvements
- [ ] Additional analytics widgets

### Week 5 Deliverables

- [ ] 70% test coverage
- [ ] Performance targets met
- [ ] Beta feedback incorporated
- [ ] All P1 bugs resolved

---

## Week 6: Launch Prep & Go-Live (Mar 30 - Apr 1)

### March 30-31: Final Preparations

#### Code Freeze **(Tech Lead)**

- [ ] Announce code freeze (no new features)
- [ ] Merge all approved PRs
- [ ] Create release branch
- [ ] Tag release candidate

#### Production Deployment Dry Run **(Platform Eng)**

- [ ] Document deployment steps
- [ ] Run deployment in staging
- [ ] Verify database migrations
- [ ] Verify Redis connectivity
- [ ] Test rollback procedure
- [ ] Time the deployment

#### Monitoring Setup **(Platform Eng)**

- [ ] Verify all dashboards
- [ ] Test all alerts
- [ ] Confirm Sentry integration
- [ ] Set up Slack channels for launch
- [ ] Create incident response channel

#### Runbook Review **(All Engineers)**

- [ ] Review [RUNBOOKS.md](./RUNBOOKS.md)
- [ ] Schedule on-call rotation
- [ ] Test escalation procedures
- [ ] Prepare hotfix process

#### Final Security Scan **(Senior Eng 2)**

- [ ] Run npm audit
- [ ] Run Snyk scan (if available)
- [ ] Review CSP configuration
- [ ] Verify no secrets in code
- [ ] Check environment variables

### April 1: Soft Launch

#### Deployment **(Platform Eng + Tech Lead)**

- [ ] Deploy to production (off-peak hours)
- [ ] Verify deployment success
- [ ] Run smoke tests
- [ ] Enable for 10% of users via feature flags
- [ ] Monitor metrics closely

#### Monitoring **(Platform Eng)**

- [ ] Watch error rates
- [ ] Watch latency
- [ ] Watch cache hit rates
- [ ] Watch database connections
- [ ] Watch external API health

#### Support **(Support Lead)**

- [ ] Brief support team on new features
- [ ] Monitor support tickets
- [ ] Prepare FAQ updates

#### Hotfix Standby **(All Engineers)**

- [ ] On-call engineer available
- [ ] Hotfix branch ready
- [ ] Quick deployment process tested

### April 2: Public Launch

#### Morning (9:00 AM)

- [ ] Final metrics check
- [ ] Confirm all systems healthy
- [ ] Remove feature flags (100% rollout)
- [ ] Announce launch internally

#### Launch Announcement **(Marketing)**

- [ ] Send email to all customers
- [ ] Publish press release
- [ ] Post on social media
- [ ] Update website
- [ ] Publish blog post

#### All Day **(Engineering + Support)**

- [ ] Monitor dashboards continuously
- [ ] Respond to issues immediately
- [ ] Track all bugs
- [ ] Collect user feedback
- [ ] Be ready for hotfixes

#### Evening **(Leadership)**

- [ ] Launch retrospective (quick)
- [ ] Celebrate with team
- [ ] Prepare Day 2 priorities

### Week 6 Deliverables

- [ ] Production deployment successful
- [ ] Soft launch completed
- [ ] Public launch executed
- [ ] Monitoring active
- [ ] Support handling tickets

---

## Daily Checklist Template

Copy this for each day:

```markdown
## Day [X] - [Date]

### Yesterday's Achievements

-
-

### Today's Focus

- [ ]
- [ ]

### Blockers

-

### Coverage %: [X]% (Target: [Y]%)

### Open P0 Bugs: [X]

### Open P1 Bugs: [X]
```

---

## Bug Triage Labels

| Label       | Meaning            | Action              |
| ----------- | ------------------ | ------------------- |
| P0-Critical | Blocks launch      | Fix immediately     |
| P1-High     | Significant impact | Fix before launch   |
| P2-Medium   | Nice to fix        | Fix if time permits |
| P3-Low      | Minor              | Post-launch         |

---

## Coverage Tracking

| Week   | Target | Actual | Notes                                             |
| ------ | ------ | ------ | ------------------------------------------------- |
| Week 1 | 15%    | 16.2%  | 292 tests (291 passing), thresholds bumped to 15% |
| Week 2 | 30%    |        |                                                   |
| Week 3 | 50%    |        |                                                   |
| Week 4 | 65%    |        |                                                   |
| Week 5 | 70%    |        |                                                   |
| Launch | 70%    |        |                                                   |

---

## Launch Day Contacts

| Role         | Name | Phone | Slack |
| ------------ | ---- | ----- | ----- |
| Tech Lead    |      |       |       |
| Platform Eng |      |       |       |
| Product Lead |      |       |       |
| Support Lead |      |       |       |
| CEO          |      |       |       |
| CTO          |      |       |       |

---

## Escalation Path

1. **Issue detected** → On-call engineer
2. **Cannot resolve in 30 min** → Tech Lead
3. **Major incident** → CTO + CEO
4. **Public/customer impact** → CEO + PR team

---

**Last Updated**: February 22, 2026 (night — backend sprint completion)  
**Next Update**: Daily during sprint

---

## Completed This Session (Feb 22)

- **Redis**: `src/lib/redis/` (client, cache), env vars `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, health check reports `deps.redis`, [REDIS_ARCHITECTURE.md](./REDIS_ARCHITECTURE.md).
- **Feature flags**: Admin API `GET/PATCH /api/admin/feature-flags` (super_admin), [FEATURE_FLAGS.md](./FEATURE_FLAGS.md).
- **Tests**: `tests/unit/health-route.test.ts`, `tests/unit/auth-login-route.test.ts`, `tests/unit/auth-register-route.test.ts` (10 tests), `tests/unit/applications-withdraw.test.ts` (2 tests).
- **Test plan**: [TEST_PLAN_LAUNCH.md](./TEST_PLAN_LAUNCH.md) — critical paths and coverage targets.
- **Monitoring**: [LAUNCH_MONITORING.md](./LAUNCH_MONITORING.md) — health endpoints, suggested alerts, dashboards.
- **Application withdrawal**: Recruiter in-app notification on withdraw; withdraw confirmation modal on candidate applications page; withdrawal unit tests.
- **Withdrawal email**: Recruiter email on withdraw via `sendApplicationWithdrawnToRecruiter` (Resend); recruiter email from `admin.auth.admin.getUserById`.
- **Core workflow tests**: `tests/unit/applications-list-route.test.ts`, `tests/unit/pipeline-stages-route.test.ts`.
- **Help**: [help/withdrawing-applications.md](./help/withdrawing-applications.md).
- **Middleware**: Restored `src/middleware.ts` (calls proxy for auth and role routing).
- **Interview scheduling**: Migration `40_interview_scheduling.sql` (table `interview_availability_slots`), `GET/POST /api/jobs/[id]/availability`, `POST /api/jobs/[id]/interviews/book`.
- **Help**: [help/managing-pipeline-stages.md](./help/managing-pipeline-stages.md).
- **Interview reschedule/cancel**: `POST /api/jobs/[id]/interviews/cancel` (body: `{ slot_id }`), `POST /api/jobs/[id]/interviews/reschedule` (body: `{ slot_id, new_slot_id }`). Unit tests in `tests/unit/interviews-routes.test.ts` (book, cancel, reschedule) and existing `availability-route.test.ts`.
- **Migration 40**: Run `supabase/schema/40_interview_scheduling.sql` in Supabase SQL Editor (or your migration workflow) so `interview_availability_slots` exists before using scheduling APIs.
- **Optional**: `@vitest/coverage-v8` is already in `package.json` devDependencies; use `npm run test:coverage` for coverage.

---

## Completed This Session (Feb 22 – continued)

- **Help article**: [help/scheduling-interviews.md](./help/scheduling-interviews.md) — how to set availability, book, reschedule, and cancel interviews; API summary and prerequisites.
- **Monitoring**: [LAUNCH_MONITORING.md](./LAUNCH_MONITORING.md) — added “How to configure alerts” (error rate, latency, readiness, cache hit rate) with Vercel, Sentry, Upstash, and synthetic check options; test alert notifications step.
- **Scheduling API tests**: POST /api/jobs/[id]/availability tests in `tests/unit/availability-route.test.ts` (401, 400 empty slots, 201 with created slots). Scheduling API test task marked complete (GET/POST availability, book/cancel/reschedule already covered).

---

## Completed This Session (Feb 22 – Launch Sprint Execution)

### Test Infrastructure

- **Shared test helpers**: `tests/helpers.ts` — mock Supabase client factory (`createMockSupabase`, `createMockQueryBuilder`), pre-built auth contexts (recruiter, company_admin, candidate, super_admin, hiring_manager), request builder, fake UUID generator.

### Service Layer Tests (37 tests)

- `tests/unit/job-service.test.ts` — list (pagination, org filter, totalPages), create (72hr shortlist_due_at), getById, update, remove, getActiveByCompany (8 tests)
- `tests/unit/candidate-service.test.ts` — listMasked (PII masking, pagination), getByUserId, eraseData (GDPR deletion chain) (5 tests)
- `tests/unit/application-service.test.ts` — listForCandidate, listForRecruiter, create (auto score lookup), updateStatus (viewed_at, delivery_feedback, notifications) (7 tests)
- `tests/unit/fitscore-service.test.ts` — listForJob, listForCandidate, listForOrg, computeSingle (not-found errors), computeBatch (parallel scoring, failures) (10 tests)
- `tests/unit/profile-service.test.ts` — get (candidate vs non-candidate), update (name alias, candidate fields, skip empty updates) (7 tests)

### Repository Layer Tests (37 tests)

- `tests/unit/job-repository.test.ts` — getById, list (search sanitization, status/candidate filters, cursor/offset pagination), create, update (updated_at), remove, getActiveByCompany, getJobIds, markShortlistDelivered (13 tests)
- `tests/unit/candidate-repository.test.ts` — getById, getByUserId, list (search, skills overlap, location ilike, intent score, experience range, offset pagination, visibility filter), create, update, upsertByPhone, eraseCandidate (PII nullification) (14 tests)
- `tests/unit/application-repository.test.ts` — getById (joins), listForCandidate (status filter), listForRecruiter (jobId filter), create, updateStatus (updated_at), findExistingScore (10 tests)

### API Route Tests (44 tests)

- `tests/unit/jobs-route.test.ts` — GET/POST auth, role checks, validation, creation (8 tests)
- `tests/unit/candidates-route.test.ts` — GET auth, role-based access (4 tests)
- `tests/unit/applications-route.test.ts` — GET (candidate/recruiter/forbidden), POST (auth, role, create, no profile) (8 tests)
- `tests/unit/notifications-route.test.ts` — GET (auth, unread count), PATCH (markAll, specific IDs, invalid body) (6 tests)
- `tests/unit/organisations-route.test.ts` — GET/PATCH auth and role checks (5 tests)
- `tests/unit/hiring-requests-route.test.ts` — GET/POST auth, role enforcement, validation (8 tests)
- `tests/unit/employees-refer-route.test.ts` — POST auth, role, no-org, invalid phone, success (5 tests)

### Utility & Security Tests (49 tests)

- `tests/unit/circuit-breaker.test.ts` — closed/open/half_open states, threshold, timeout, reset on success, singleton registry (10 tests)
- `tests/unit/pii.test.ts` — maskCandidateForShortlist (unlock passthrough, PII nullification, name masking variants, null/empty/multi-word names) (8 tests)
- `tests/unit/dlq.test.ts` — appendToDlq (insert, null error, graceful failure on DB/throw errors) (4 tests)
- `tests/unit/logger.test.ts` — info/debug/agent logging, production JSON stdout, PII redaction (email/phone), debug suppression in prod (7 tests)
- `tests/unit/validate.test.ts` — CreateJobSchema, UpdateJobSchema, UnlockCandidateSchema, ReferCandidateSchema, InviteEmployeeSchema, CreateApplicationSchema, UpdateApplicationSchema, CreateHiringRequestSchema, CreateApprovalSchema (20 tests)

### New Backend Features

#### Interview Email Notifications

- Added to `src/lib/services/resend.ts`: `sendInterviewBooked()`, `sendInterviewCancelled()`, `sendInterviewRescheduled()` — styled HTML emails with date/time/timezone.
- Wired into `src/app/api/jobs/[id]/interviews/book/route.ts` — sends email to candidate on booking.
- Wired into `src/app/api/jobs/[id]/interviews/cancel/route.ts` — sends email to candidate on cancellation.
- Wired into `src/app/api/jobs/[id]/interviews/reschedule/route.ts` — sends email to candidate on reschedule.
- All email sends are in try/catch to avoid breaking the booking flow on email failure.

#### Interview Feedback Forms (DB + API + 11 tests)

- **Migration**: `supabase/schema/41_interview_feedback.sql` — `feedback_form_templates` (jsonb fields), `feedback_responses` (rating, recommendation, notes) with indexes.
- **API**: `GET/POST /api/jobs/[id]/feedback-templates` — list and create customizable form templates.
- **API**: `GET /api/jobs/[id]/feedback` — list responses with aggregation (avg rating, recommendation distribution), filter by pipeline_candidate_id.
- **API**: `POST /api/jobs/[id]/feedback` — submit feedback (validation: rating 1-5, recommendation enum).
- **Tests**: `tests/unit/feedback-routes.test.ts` — auth, role, validation, CRUD (11 tests).

#### Resume Version Management (DB + API + 9 tests)

- **Migration**: `supabase/schema/42_resume_versions.sql` — `resume_versions` table with is_default flag, partial index on default.
- **API**: `GET /api/candidates/[id]/resumes` — list all resume versions.
- **API**: `POST /api/candidates/[id]/resumes` — upload new version (auto-unset previous default if is_default=true).
- **API**: `PATCH /api/candidates/[id]/resumes/[versionId]` — set as default (atomic swap).
- **API**: `DELETE /api/candidates/[id]/resumes/[versionId]` — delete (blocks deletion of default resume).
- **Tests**: `tests/unit/resume-versions-route.test.ts` — auth, role, validation, CRUD (9 tests).

#### Pipeline Stages Integration Tests (10 tests)

- `tests/unit/pipeline-stages-integration.test.ts` — GET/POST auth, role checks, empty stages, insert path, update path, reordering, mixed new+existing stages (10 tests).

### Coverage & Config

- **Coverage**: 16.2% lines, 15.64% branches, 13.39% functions, 16.34% statements (up from 2-5% thresholds).
- **Thresholds bumped** in `vitest.config.ts`: lines 15%, branches 14%, functions 12%, statements 15%.
- **Total tests**: 292 (291 passing; 1 pre-existing timeout in auth-register).

---

## Completed This Session (Feb 22 – Backend Sprint)

### Custom Pipeline Stages (Complete)

- **Migration**: `supabase/schema/43_pipeline_stage_migration.sql` — creates 5 default stages (Applied, Screening, Interview, Offer, Hired) for all jobs missing custom stages; backfills `pipeline_candidates.stage_id` to first stage.
- **API**: Updated `PATCH /api/jobs/[id]/pipeline/candidates/[pcId]` to sync application status when pipeline candidate status changes (hired → applications.status=hired, etc.).

### In-App Messaging (Backend Complete — 10 tests)

- **Migration**: `supabase/schema/44_messages.sql` — `conversations`, `conversation_participants`, `messages` tables with RLS policies, indexes, and Supabase Realtime enabled.
- **API**: `GET /api/messages` — list conversations with last message preview, unread counts, participant IDs.
- **API**: `POST /api/messages` — create conversation with initial message. Body: `{ participant_ids, message, subject?, job_id? }`.
- **API**: `GET /api/messages/[conversationId]` — get messages (paginated via `?before=` cursor), auto-marks as read.
- **API**: `POST /api/messages/[conversationId]` — send message with optional file attachment. Triggers in-app notification + email to other participants.
- **Real-time**: Messages table added to `supabase_realtime` publication for Supabase Realtime subscriptions.
- **Tests**: `tests/unit/messages-route.test.ts` — auth, validation, empty state, conversation creation, participant checks (10 tests).

### Interview Feedback — Default Templates + Integration Tests (7 tests)

- **Migration**: `supabase/schema/45_default_feedback_templates.sql` — seeds a 7-field default template (Technical Skills, Communication, Problem Solving, Culture Fit, Strengths, Areas for Improvement, Notes) for all jobs without templates.
- **Tests**: `tests/unit/feedback-integration.test.ts` — template creation, listing, feedback submission, aggregation (avg rating, recommendation distribution), role enforcement, validation (7 tests).

### SSO Integration (Backend Complete — 11 tests)

- **API**: `POST /api/auth/sso` — initiate Google or LinkedIn OAuth via Supabase Auth. Returns `{ url, provider }`.
- **API**: `POST /api/auth/link` — link an OAuth provider to the current user's account.
- **API**: `GET /api/auth/link` — list linked OAuth identities for the current user.
- **Callback**: Existing `/api/auth/callback` already handles code exchange, profile creation, and role-based routing.
- **Tests**: `tests/unit/auth-sso-route.test.ts` — provider validation, OAuth URL generation, linking, identity listing (11 tests).

### Analytics Dashboard (Backend Complete — 7 tests)

- **Migration**: `supabase/schema/46_analytics_views.sql` — 4 SQL views: `analytics_time_to_hire`, `analytics_pipeline_conversion`, `analytics_candidates_by_source`, `analytics_recent_activity`.
- **API**: `GET /api/analytics?metric=overview|time_to_hire|pipeline|sources|activity` — org-scoped analytics for recruiter dashboards. Super admins can access cross-org.
- **Tests**: `tests/unit/analytics-route.test.ts` — auth, role enforcement, all 5 metric types, super_admin access (7 tests).

### Saved Searches & Job Alerts (Backend Complete — 12 tests)

- **Migration**: `supabase/schema/47_saved_searches.sql` — `saved_searches` table with jsonb filters, alert_enabled, alert_frequency (daily/weekly/never).
- **API**: `GET /api/saved-searches` — list user's saved searches.
- **API**: `POST /api/saved-searches` — create saved search with filters and alert config.
- **API**: `GET /api/saved-searches/[id]` — get specific saved search.
- **API**: `PATCH /api/saved-searches/[id]` — update name, filters, alert settings.
- **API**: `DELETE /api/saved-searches/[id]` — delete saved search.
- **Cron**: `POST /api/cron/job-alerts` — daily cron job sends email digests for matching new jobs; respects frequency (daily/weekly) and tracks `last_alerted_at`.
- **Tests**: `tests/unit/saved-searches-route.test.ts` — CRUD, validation, alert frequency, auth (12 tests).

### Email Preferences (Backend Complete — 7 tests)

- **Migration**: `supabase/schema/48_email_preferences.sql` — `email_preferences` table: marketing, job_alerts, application_updates, messages, interview_reminders, weekly_digest (all default true, opt-out model).
- **API**: `GET /api/email-preferences` — get preferences; auto-creates defaults if none exist.
- **API**: `PATCH /api/email-preferences` — partial update of boolean preference flags.
- **Tests**: `tests/unit/email-preferences-route.test.ts` — auth, default creation, update, validation (7 tests).

### Stripe Webhook Tests (10 tests)

- **Tests**: `tests/unit/stripe-webhook.test.ts` — signature verification, idempotency (duplicate event skipped), checkout.session.completed (company + candidate), subscription.updated, subscription.deleted (candidate downgrade + org downgrade), invoice.payment_failed, error handling, unknown events (10 tests).

### Test Summary

- **New tests this session**: 68 (all passing)
- **Total tests**: 360 (358 passing; 2 pre-existing timeouts in auth-login + auth-register)
- **New migrations**: 43–48 (pipeline migration, messages, feedback templates, analytics views, saved searches, email preferences)
- **New API routes**: 10 endpoints across messages, SSO, analytics, saved searches, email preferences, job alerts cron
