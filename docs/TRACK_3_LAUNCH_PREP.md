# Track 3: Launch Preparation — Subagent Work Plan

> **Owner:** Launch / PM subagent
> **Priority:** P0–P1
> **Pending tasks:** ~34
> **Depends on:** Product decisions, customer access, team coordination

---

## TASK 3.1 — Product Specs (P0)

**Goal:** Finalize PRDs for all 4 core features and get leadership sign-off.

### Context

Each feature is already built (backend complete, frontend complete). PRDs document what was built, edge cases, and serve as the source of truth.

### Deliverables

Create/finalize these PRD files in `docs/prds/`:

| File                                | Feature                  | Key Sections                                                                                                                                  |
| ----------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/prds/interview-scheduling.md` | Interview Scheduling     | Overview, user stories, API contract, UI wireframes, edge cases (timezone handling, double-booking prevention, cancellation policy), metrics  |
| `docs/prds/in-app-messaging.md`     | In-App Messaging         | Overview, user stories, API contract, real-time delivery (Supabase Realtime), attachment handling, conversation model, read receipts, metrics |
| `docs/prds/interview-feedback.md`   | Interview Feedback Forms | Overview, user stories, template builder spec, rating system (1–5), recommendation enum, aggregation logic, API contract, metrics             |
| `docs/prds/custom-pipeline.md`      | Custom Pipeline Stages   | Overview, user stories, stage CRUD, drag-and-drop reordering, candidate stage transitions, status sync logic, API contract, metrics           |

### PRD Template

Each PRD should follow this structure:

```markdown
# [Feature Name] — Product Requirements Document

## Overview

One-paragraph summary of the feature and its value.

## User Stories

- As a [role], I want to [action] so that [benefit].

## Functional Requirements

Numbered list of requirements with acceptance criteria.

## API Contract

Table of endpoints with method, path, request body, response body.

## UI Specifications

Screenshots or wireframe descriptions of key screens.

## Edge Cases & Error Handling

Table of edge cases with expected behavior.

## Success Metrics

- KPI 1: description, target
- KPI 2: description, target

## Open Questions

List any unresolved decisions.
```

### Steps

1. Create `docs/prds/` directory
2. Write each PRD using the template above
3. Reference the existing API implementations:
   - Scheduling: `src/app/api/jobs/[id]/availability/`, `src/app/api/jobs/[id]/interviews/`
   - Messaging: `src/app/api/messages/`
   - Feedback: `src/app/api/jobs/[id]/feedback-templates/`, `src/app/api/jobs/[id]/feedback/`
   - Pipeline: `src/app/api/jobs/[id]/pipeline-stages/`, `src/app/api/jobs/[id]/pipeline/`
4. Share with leadership for review
5. Track approval status

### Acceptance

- [ ] 4 PRD files created in `docs/prds/`
- [ ] Each PRD has all template sections filled
- [ ] Leadership approval obtained (tracked in a comment or status field)

---

## TASK 3.2 — Documentation: Help Articles (P1)

**Goal:** Write 3 user-facing help articles for the new features.

### Deliverables

Create in `docs/help/`:

### 3.2a — Help Article: Using In-App Messaging

File: `docs/help/in-app-messaging.md`

**Outline:**

1. **Getting Started** — Where to find messages in the dashboard
2. **Viewing Conversations** — Conversation list, unread indicators
3. **Sending a Message** — Compose area, attachments
4. **Real-Time Updates** — Messages appear instantly
5. **Tips** — Keep conversations professional, response time expectations
6. **FAQ** — "Can I delete a message?", "Who can message me?", "How do I mute a conversation?"

### 3.2b — Help Article: Interview Feedback Forms

File: `docs/help/interview-feedback.md`

**Outline:**

1. **For Recruiters: Creating Templates** — Navigate to feedback templates, add fields (text, rating, yes/no, dropdown)
2. **For Interviewers: Submitting Feedback** — Open candidate profile → feedback tab, select template, fill responses, rate 1–5, add recommendation
3. **Viewing Aggregated Feedback** — See average rating, recommendation breakdown, individual responses
4. **Best Practices** — Structured interviews, consistent rating criteria
5. **FAQ** — "Can I edit my feedback?", "Who can see feedback?", "What do the recommendation options mean?"

### 3.2c — Help Article: Managing Resume Versions

File: `docs/help/resume-versions.md`

**Outline:**

1. **Uploading a New Version** — Navigate to profile → resumes, click upload
2. **Setting a Default** — Click "Set as default" on any version
3. **Viewing History** — All versions listed with upload date
4. **Deleting a Version** — Delete non-default versions (cannot delete the default)
5. **Tips** — Tailor resumes per job type, keep default version up to date
6. **FAQ** — "How many versions can I have?", "Can recruiters see all versions?", "What file formats are supported?"

### Acceptance

- [ ] 3 help article files created in `docs/help/`
- [ ] Each article has clear headings, step-by-step instructions, and FAQ
- [ ] Language is concise and non-technical

---

## TASK 3.3 — Beta Preparation (P1)

**Goal:** Select beta customers, create onboarding materials, set up feedback collection.

### Steps

1. **Select 5 beta customers:**
   - Criteria: Active Supabase account, at least 1 job posting, responsive to email
   - Mix: 2 small companies (< 50 employees), 2 mid-size (50–500), 1 large (500+)
   - Document selections in `docs/beta/BETA_CUSTOMERS.md`

2. **Create beta onboarding materials:**
   - File: `docs/beta/ONBOARDING_GUIDE.md`
   - Contents:
     - Welcome message
     - What's new (4 features summary)
     - How to access new features
     - Known limitations
     - How to report bugs
     - Beta timeline (start date, end date, go-live date)
     - Contact information

3. **Set up feedback collection:**
   - Create a Typeform or Google Form for structured feedback
   - Categories: Bug report, Feature request, UX feedback, General
   - Severity: Critical, Major, Minor, Cosmetic
   - Include fields: Feature area, Steps to reproduce, Expected vs Actual, Screenshots
   - Document the form link in `docs/beta/FEEDBACK_PROCESS.md`

4. **Schedule beta kickoff calls:**
   - 30-minute call with each beta customer
   - Agenda: Demo new features, walkthrough of feedback process, Q&A
   - Document schedule in `docs/beta/KICKOFF_SCHEDULE.md`

### Acceptance

- [ ] 5 beta customers selected and documented
- [ ] Onboarding guide written
- [ ] Feedback form created and linked
- [ ] Kickoff calls scheduled

---

## TASK 3.4 — Beta Testing (P1)

**Goal:** Run beta program, collect feedback, triage into actionable items.

### Steps

1. **Onboard beta customers:**
   - Send onboarding guide
   - Enable feature flags for beta users
   - Conduct kickoff calls

2. **Collect daily feedback:**
   - Check feedback form responses daily
   - Monitor `#tigerhire-support` Slack channel
   - Send daily check-in messages to beta customers (Days 1–3, then every other day)

3. **Triage feedback:**
   - Create `docs/beta/FEEDBACK_LOG.md`:

```markdown
| #   | Date | Customer | Category | Severity | Description | Status | Resolution |
| --- | ---- | -------- | -------- | -------- | ----------- | ------ | ---------- |
| 1   |      |          |          |          |             | Open   |            |
```

- Categories: Bug, Feature Request, UX, Performance
- Status: Open → In Progress → Fixed → Verified

4. **Fix critical beta issues:**
   - Critical = blocks core workflow
   - Target: fix within 24 hours
   - Coordinate with Track 1 (Code) for implementation

5. **Update documentation:**
   - Revise help articles based on confusion points
   - Update onboarding guide if workflows changed

### Acceptance

- [ ] All 5 customers onboarded
- [ ] Feedback log maintained with all submissions
- [ ] All critical issues fixed
- [ ] Help articles revised based on feedback

---

## TASK 3.5 — Production Deployment Dry Run (P0)

**Goal:** Practice the full deployment end-to-end in staging.

_Execute March 30–31_

### Context

- Hosting: Vercel (assumed, given Next.js)
- Database: Supabase PostgreSQL
- Migrations: `supabase/schema/` directory
- Redis: Upstash (from Track 2)

### Steps

1. **Document deployment steps** in `docs/DEPLOYMENT_RUNBOOK.md`:

```markdown
# Deployment Runbook

## Pre-Deployment Checklist

- [ ] All CI checks passing on release branch
- [ ] Database backup taken
- [ ] Redis snapshot taken (if applicable)
- [ ] Team notified in #tigerhire-launch

## Deployment Steps

1. Merge release branch to production
2. Vercel auto-deploys (or manual deploy via CLI)
3. Wait for deployment to complete (~3–5 min)
4. Verify health endpoint: GET /api/health
5. Run database migrations (if any pending)
6. Verify Redis connectivity

## Post-Deployment Verification

- [ ] Health endpoint returns 200
- [ ] Login works
- [ ] Dashboard loads
- [ ] API endpoints respond

## Rollback Procedure

1. Revert to previous deployment in Vercel dashboard
2. If database migration was applied: run rollback migration
3. Verify health endpoint
4. Notify team
```

2. **Run deployment in staging:**
   - Deploy release branch to Vercel preview
   - Run through all deployment steps
   - Document any issues

3. **Verify database migrations (40–48):**
   - List all pending migrations
   - Run against staging database
   - Verify schema changes applied correctly
   - Test rollback for each migration

4. **Verify Redis connectivity:**
   - Confirm `checkRedis()` returns `true` in staging
   - Test rate limiting
   - Test cache operations

5. **Test rollback procedure:**
   - Deploy a known-bad change to staging
   - Execute rollback steps
   - Verify the app returns to working state

6. **Time the deployment:**
   - Record total deployment time (deploy + migrations + verification)
   - Target: < 10 minutes for full deployment

### Acceptance

- [ ] `docs/DEPLOYMENT_RUNBOOK.md` written
- [ ] Dry run completed in staging
- [ ] All migrations verified
- [ ] Redis connectivity confirmed
- [ ] Rollback procedure tested
- [ ] Total deployment time recorded

---

## TASK 3.6 — Runbook Review (P0)

**Goal:** Ensure operational readiness with reviewed runbooks and on-call setup.

_Execute March 30–31_

### Steps

1. **Review `docs/RUNBOOKS.md`:**
   - Verify all runbooks are up to date
   - Add runbooks for new features if missing:
     - Interview scheduling: what to do if calendar sync fails
     - Messaging: what to do if real-time delivery stops
     - Feedback: what to do if aggregation is wrong
   - Ensure each runbook has: Symptoms, Diagnosis steps, Resolution steps, Escalation path

2. **Schedule on-call rotation:**
   - Create `docs/ON_CALL_ROTATION.md`:
     - April 1–2 (launch days): Primary + Secondary engineer
     - April 3–9 (first week): Daily rotation
     - Escalation: Engineer → Tech Lead → CTO
   - Set up PagerDuty/Opsgenie if available, or Slack-based rotation

3. **Test escalation procedures:**
   - Simulate a P1 incident
   - Verify alert reaches primary on-call within 5 min
   - Verify escalation to secondary after 15 min no-response

4. **Prepare hotfix process:**
   - Document in `docs/HOTFIX_PROCESS.md`:
     - Branch from release tag
     - Fix, test, PR review (expedited — 1 reviewer)
     - Deploy directly to production
     - Backport to main

### Acceptance

- [ ] Runbooks reviewed and updated
- [ ] On-call rotation documented
- [ ] Escalation tested
- [ ] Hotfix process documented

---

## TASK 3.7 — Soft Launch: Monitoring & Support (P0)

**Goal:** Smooth April 1 soft launch with active monitoring and support coverage.

_Execute April 1_

### Pre-Soft-Launch Checklist (Morning)

- [ ] All dashboards open:
  - Vercel: deployment status, function invocations, errors
  - Supabase: database connections, API requests, auth sessions
  - Sentry: error feed (should be empty)
  - Upstash: Redis operations, memory usage
- [ ] `#tigerhire-launch` Slack channel active
- [ ] On-call engineer confirmed available

### During Soft Launch

**Monitor continuously (check every 15 min for first 2 hours, then every 30 min):**

| Metric            | Dashboard        | Alert Threshold  |
| ----------------- | ---------------- | ---------------- |
| Error rate        | Sentry           | > 5 errors / min |
| API latency (p95) | Vercel Functions | > 2s             |
| Cache hit rate    | Upstash          | < 50%            |
| DB connections    | Supabase         | > 80% pool size  |
| Auth failures     | Supabase Auth    | > 10 / min       |

**Support:**

- [ ] Brief support team: send summary of new features, known limitations, FAQ
- [ ] Monitor support tickets for patterns
- [ ] Prepare FAQ updates based on Day 1 questions

### Incident Response

If any alert fires:

1. Post in `#tigerhire-incidents`
2. Classify severity: P1 (service down), P2 (degraded), P3 (minor)
3. P1: Rollback immediately, then investigate
4. P2: Investigate, fix, deploy hotfix
5. P3: Log, fix in next deployment

### Acceptance

- [ ] All dashboards monitored for full day
- [ ] Support team briefed
- [ ] No unresolved P1/P2 incidents by end of day
- [ ] FAQ updated if needed

---

## TASK 3.8 — Public Launch: Go-Live (P0)

**Goal:** April 2 public launch with coordinated announcement and all-day monitoring.

### Morning (9:00 AM)

1. **Final metrics check:**
   - Verify all metrics from soft launch are healthy
   - Confirm no new Sentry errors overnight
   - Check database and Redis health

2. **Confirm all systems healthy:**
   - `GET /api/health` returns 200
   - Login/signup works
   - Core features responsive

3. **Remove feature flags (100% rollout):**
   - Update feature flag configuration to enable for all users
   - Verify in 2–3 browser sessions

4. **Announce launch internally:**
   - Post in `#tigerhire-launch`: "We're live! 🚀"
   - Tag all team members

### Launch Announcement

Prepare these in advance (March 28–29), publish on April 2:

| Channel           | Content                               | Owner                   |
| ----------------- | ------------------------------------- | ----------------------- |
| **Email**         | Launch email to all customers         | Marketing               |
| **Press Release** | PR to distribution service            | Marketing               |
| **Social Media**  | LinkedIn, Twitter/X posts             | Marketing               |
| **Website**       | Update landing page with new features | Engineering + Marketing |
| **Blog**          | Feature announcement blog post        | Content                 |

### Launch Email Template

```
Subject: TigerHire just got smarter — 4 new features live today

Hi [Name],

We've been busy building, and today we're excited to launch:

🗓️ Interview Scheduling — Book, cancel, and reschedule directly in TigerHire
💬 In-App Messaging — Talk to candidates without leaving the platform
📝 Interview Feedback Forms — Structured feedback with ratings and recommendations
📊 Custom Pipeline Stages — Build your own hiring pipeline

[Get Started →]

Questions? Reply to this email or reach us at hello@tigerhire.io.

— The TigerHire Team
```

### All Day Monitoring

Same as soft launch (Task 3.7) but with full user load:

- Monitor every 15 min for first 4 hours
- Respond to issues immediately
- Track all bugs in `docs/beta/FEEDBACK_LOG.md` (continue from beta)
- Collect user feedback

### Evening

- [ ] **Launch retrospective (30 min):**
  - What went well?
  - What didn't go well?
  - What surprised us?
  - Action items for tomorrow
- [ ] **Celebrate with team**
- [ ] **Prepare Day 2 priorities:**
  - List top 3 issues to fix
  - List top 3 user requests
  - Plan next sprint

### Acceptance

- [ ] Feature flags removed, 100% rollout confirmed
- [ ] Launch announcements published across all channels
- [ ] All-day monitoring completed with no unresolved P1s
- [ ] Retrospective conducted
- [ ] Day 2 priorities documented

---

**End of Track 3 Plan**
