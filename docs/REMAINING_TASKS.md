# TigerHire — Remaining Tasks (as of Feb 22, 2026)

> **SUPERSEDED (2026-07-08).** This document is a historical snapshot; its dates,
> task states, and flag references are no longer accurate. Current status:
> [`docs/ops/STATUS-2026-07-08.md`](ops/STATUS-2026-07-08.md) · launch
> decision: [`docs/launch/GO-NO-GO-JUN-2026.md`](launch/GO-NO-GO-JUN-2026.md).

> All backend API work is complete. This document covers everything that still needs to be done before the April 2nd launch. Tasks are divided into **Code**, **Third Party**, and **Launch Preparation**.

---

## Status Overview

| Status        | Count   |
| ------------- | ------- |
| **Completed** | **31**  |
| **Pending**   | **~92** |

---

## Summary by Track

| Track                  | Pending | Priority Range |
| ---------------------- | ------- | -------------- |
| **Code**               | ~50     | P0–P2          |
| **Third Party**        | ~8      | P1–P2          |
| **Launch Preparation** | ~34     | P0–P1          |
| **Total Pending**      | **~92** |                |

---

## Completed Work (for reference)

<details>
<summary>All 31 completed tasks — click to expand</summary>

### Frontend — Core Features (22/22 done)

- [x] Interview Scheduling: Calendar UI, Booking flow
- [x] Custom Pipeline: Pipeline builder UI, Drag-and-drop stages, Stage settings
- [x] In-App Messaging: Message UI, Conversation list, Message composer
- [x] Feedback Forms: Form builder, Feedback submission, Feedback view
- [x] Resume Versions: Version selector, Version upload, Version history
- [x] Analytics Dashboard: Dashboard layout, Time-to-hire chart, Pipeline conversion chart, Candidates by source, Recent activity feed

### Frontend — Platform & Settings (9/10 done)

- [x] SSO buttons (login + register pages)
- [x] Save search button, Saved searches list, Alert settings
- [x] Email Preferences UI

</details>

---

# TRACK 1: CODE

> Tasks that require writing, modifying, or testing application code.

---

## 1.1 Backend — Email Preferences Enforcement (P1)

- [ ] Respect email preferences (`email_preferences` table) in all email-sending code paths

---

## 1.2 Testing & Coverage (P1)

| Milestone       | Current | Target |
| --------------- | ------- | ------ |
| Week 2 coverage | ~16%    | 30%    |
| Week 3 coverage | —       | 50%    |
| Week 4 coverage | —       | 65%    |
| Week 5 coverage | —       | 70%    |

- [ ] E2E tests for scheduling flow
- [ ] E2E tests for messaging flow
- [ ] Integration tests for messaging
- [ ] Integration testing across features
- [ ] Security testing (auth flows)
- [ ] Edge case handling tests
- [ ] Reach 30% coverage (Week 2 target)
- [ ] Reach 50% coverage (Week 3 target)
- [ ] Reach 70% coverage (Week 5 target)

---

## 1.3 PWA Support (P2)

- [ ] Create `manifest.json`
- [ ] Add service worker
- [ ] Configure caching strategy
- [ ] Add install prompts
- [ ] Test offline behavior
- [ ] Test on iOS Safari
- [ ] Test on Android Chrome

---

## 1.4 Load Testing (P1)

- [ ] Set up k6 testing environment
- [ ] Write load tests for critical paths
- [ ] Run 500 concurrent user test
- [ ] Document results
- [ ] Address any performance issues

---

## 1.5 Performance Optimization (P1)

- [ ] Identify slow queries
- [ ] Add database indexes where needed
- [ ] Optimize API response times
- [ ] Cache warming strategy
- [ ] Document performance improvements

---

## 1.6 Bug Fixes & QA (P1)

- [ ] Triage all P1 bugs
- [ ] Fix UI/UX issues
- [ ] Fix mobile responsiveness
- [ ] Fix accessibility issues
- [ ] Cross-browser testing

---

## 1.7 P2 Features — If Time Permits

- [ ] Job alert customization UI
- [ ] Email template improvements
- [ ] Additional analytics widgets

---

## 1.8 Code Freeze & Release Engineering (P0)

_March 30–31_

- [ ] Announce code freeze (no new features)
- [ ] Merge all approved PRs
- [ ] Create release branch
- [ ] Tag release candidate

---

## 1.9 Final Security Scan (P0)

_March 30–31_

- [ ] Run `npm audit`
- [ ] Run Snyk scan (if available)
- [ ] Review CSP configuration
- [ ] Verify no secrets in code
- [ ] Check environment variables

---

## 1.10 Production Deployment & Smoke Tests (P0)

_April 1 — Soft Launch_

- [ ] Deploy to production (off-peak hours)
- [ ] Verify deployment success
- [ ] Run smoke tests
- [ ] Enable for 10% of users via feature flags

_April 2 — Public Launch_

- [ ] Remove feature flags (100% rollout)

---

## 1.11 Hotfix Readiness (P0)

- [ ] Hotfix branch ready
- [ ] Quick deployment process tested

---

**Code Track Total: ~50 tasks**

---

# TRACK 2: THIRD PARTY

> Tasks that require setting up, configuring, or integrating external services.

---

## 2.1 Infrastructure — Upstash Redis (P1)

- [ ] Set up Upstash Redis account (production credentials for `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`)

---

## 2.2 Infrastructure — Supabase (P1)

- [ ] Configure Supabase connection pooling (PgBouncer or Supavisor in Supabase dashboard)

---

## 2.3 Monitoring Services (P0)

_March 30–31_

- [ ] Confirm Sentry integration
- [ ] Verify all monitoring dashboards
- [ ] Test all alerts

---

## 2.4 Communication Channels (P0)

_March 30–31_

- [ ] Set up Slack channels for launch
- [ ] Create incident response channel

---

## 2.5 Integrations — Nice to Have (P2)

- [ ] Google Calendar integration (interview scheduling)
- [ ] WhatsApp reminders (interview scheduling)

---

**Third Party Track Total: ~8 tasks**

---

# TRACK 3: LAUNCH PREPARATION

> Tasks that are process, people, documentation, or communication oriented.

---

## 3.1 Product Specs (P0)

- [ ] Finalize interview scheduling PRD
- [ ] Finalize in-app messaging PRD
- [ ] Finalize interview feedback forms PRD
- [ ] Finalize custom pipeline stages PRD
- [ ] Get spec approvals from leadership

---

## 3.2 Documentation (P1)

- [ ] Help article: Using in-app messaging
- [ ] Help article: Interview feedback forms
- [ ] Help article: Managing resume versions

---

## 3.3 Beta Preparation (P1)

- [ ] Select 5 beta customers
- [ ] Create beta onboarding materials
- [ ] Set up feedback collection
- [ ] Schedule beta kickoff calls

---

## 3.4 Beta Testing (P1)

- [ ] Onboard beta customers
- [ ] Collect daily feedback
- [ ] Triage feedback into bugs/feature requests
- [ ] Fix critical beta issues
- [ ] Update documentation based on feedback

---

## 3.5 Production Deployment Dry Run (P0)

_March 30–31_

- [ ] Document deployment steps
- [ ] Run deployment in staging
- [ ] Verify database migrations (40–48)
- [ ] Verify Redis connectivity
- [ ] Test rollback procedure
- [ ] Time the deployment

---

## 3.6 Runbook Review (P0)

_March 30–31_

- [ ] Review [RUNBOOKS.md](./RUNBOOKS.md)
- [ ] Schedule on-call rotation
- [ ] Test escalation procedures
- [ ] Prepare hotfix process

---

## 3.7 Soft Launch — Monitoring & Support (P0)

_April 1_

- [ ] Monitor metrics closely
- [ ] Watch error rates
- [ ] Watch latency
- [ ] Watch cache hit rates
- [ ] Watch database connections
- [ ] Watch external API health
- [ ] Brief support team on new features
- [ ] Monitor support tickets
- [ ] Prepare FAQ updates
- [ ] On-call engineer available

---

## 3.8 Public Launch — Go-Live (P0)

_April 2 — Morning (9:00 AM)_

- [ ] Final metrics check
- [ ] Confirm all systems healthy
- [ ] Announce launch internally

_April 2 — Launch Announcement_

- [ ] Send email to all customers
- [ ] Publish press release
- [ ] Post on social media
- [ ] Update website
- [ ] Publish blog post

_April 2 — All Day_

- [ ] Monitor dashboards continuously
- [ ] Respond to issues immediately
- [ ] Track all bugs
- [ ] Collect user feedback
- [ ] Be ready for hotfixes

_April 2 — Evening_

- [ ] Launch retrospective (quick)
- [ ] Celebrate with team
- [ ] Prepare Day 2 priorities

---

**Launch Preparation Track Total: ~34 tasks**

---

## Suggested Sprint Order

| Phase        | Focus                                                                      | Timeline |
| ------------ | -------------------------------------------------------------------------- | -------- |
| **Sprint A** | Code: Email prefs enforcement, begin testing                               | 1 week   |
| **Sprint B** | Code: Testing & coverage push to 50%+, Bug fixes                           | 1 week   |
| **Sprint C** | Code: PWA, Load testing, Performance; Third Party: Redis, Supabase pooling | 1 week   |
| **Sprint D** | Launch Prep: Beta prep & testing; Code: Coverage push to 70%               | 1 week   |
| **Sprint E** | Launch Prep: Beta feedback fixes, Docs; Third Party: Monitoring, Slack     | 1 week   |
| **Sprint F** | Code: Code freeze, Security scan; Launch Prep: Dry run, Go-live            | 3 days   |

---

## Backend API Quick Reference

All APIs require authentication via Supabase session cookie unless noted.

| Feature             | Endpoint                                    | Method             | Role             |
| ------------------- | ------------------------------------------- | ------------------ | ---------------- |
| **Scheduling**      | `/api/jobs/[id]/availability`               | GET, POST          | Recruiter+       |
|                     | `/api/jobs/[id]/interviews/book`            | POST               | Recruiter+       |
|                     | `/api/jobs/[id]/interviews/cancel`          | POST               | Recruiter+       |
|                     | `/api/jobs/[id]/interviews/reschedule`      | POST               | Recruiter+       |
| **Pipeline**        | `/api/jobs/[id]/pipeline-stages`            | GET, POST          | Recruiter+       |
|                     | `/api/jobs/[id]/pipeline/candidates/[pcId]` | PATCH              | Recruiter+       |
| **Messaging**       | `/api/messages`                             | GET, POST          | Any auth         |
|                     | `/api/messages/[conversationId]`            | GET, POST          | Participant      |
| **Feedback**        | `/api/jobs/[id]/feedback-templates`         | GET, POST          | Recruiter+       |
|                     | `/api/jobs/[id]/feedback`                   | GET, POST          | Recruiter+       |
| **Resumes**         | `/api/candidates/[id]/resumes`              | GET, POST          | Owner/Recruiter+ |
|                     | `/api/candidates/[id]/resumes/[versionId]`  | PATCH, DELETE      | Owner/Recruiter+ |
| **Analytics**       | `/api/analytics?metric=...`                 | GET                | Recruiter+       |
| **SSO**             | `/api/auth/sso`                             | POST               | Public           |
|                     | `/api/auth/link`                            | GET, POST          | Any auth         |
| **Saved Searches**  | `/api/saved-searches`                       | GET, POST          | Any auth         |
|                     | `/api/saved-searches/[id]`                  | GET, PATCH, DELETE | Owner            |
| **Email Prefs**     | `/api/email-preferences`                    | GET, PATCH         | Any auth         |
| **Job Alerts Cron** | `/api/cron/job-alerts`                      | POST               | CRON_SECRET      |

---

**Created**: February 22, 2026
**Source**: [APRIL_2ND_LAUNCH_TASK_TRACKER.md](./archive/2026-q1-q2/APRIL_2ND_LAUNCH_TASK_TRACKER.md) (archived 2026-05-12; original April-2 launch cycle)
