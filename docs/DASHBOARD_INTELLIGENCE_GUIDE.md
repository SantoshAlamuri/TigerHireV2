# Dashboard Intelligence Guide

This document explains the forward-looking dashboard layer added for recruiter and company views:

- "Tomorrow command center"
- "Futuristic signals"
- Urgency bands
- SLA breach warning
- "Start tomorrow plan" focused pipeline flow

Use this as the update guide when adjusting thresholds, routing, or UI copy.

## Scope and files

### Recruiter dashboard

- `src/app/(dashboard)/recruit/page.tsx`
- `src/app/(dashboard)/recruit/pipeline/page.tsx`

### Company dashboard

- `src/app/(dashboard)/company/page.tsx`
- `src/app/(dashboard)/company/my-pipeline/page.tsx`

## Data inputs used

Dashboards use existing APIs only (no new backend route was added):

- `/api/my-pipeline`
  - upcoming interviews
  - pending feedback
  - overdue feedback
- `/api/applications?limit=100`
  - pending application pressure (`applied`, `viewed`)
- `/api/analytics?metric=activity`
  - recent activity list

## Current logic (v1 heuristics)

### Shared definitions

- **Pending feedback:** interview is scheduled in the past and no `interview_outcome`.
- **Overdue feedback:** pending feedback older than 24 hours.
- **Tomorrow interviews:** scheduled between tomorrow 00:00 and day+1 00:00 (local browser time).

### Recruiter scoring

- `aiRiskScore = min(100, pendingApplications*2 + pendingFeedback*14 + overdueFeedback*10)`
- Urgency:
  - `Critical` when score >= 70
  - `Medium` when score >= 40
  - `Low` otherwise
- SLA warning when:
  - `overdueFeedback > 0` OR
  - `pendingFeedback >= 4`

### Company scoring

- `deliveryHealth = max(0, 100 - (pendingFeedback*8 + overdueFeedback*12 + pendingApplications))`
- Urgency:
  - `Critical` when health <= 40
  - `Medium` when health <= 70
  - `Low` otherwise
- SLA warning when:
  - `overdueFeedback > 0` OR
  - `pendingFeedback >= 4`

## Focus-mode routing

### Query params supported

- `focus=needs-feedback`
- `focus=tomorrow-plan`

### Recruiter routes

- Dashboard CTA:
  - `/recruit/pipeline?focus=tomorrow-plan`
- Pending feedback deep-link:
  - `/recruit/pipeline?focus=needs-feedback`
- Pipeline page supports both focus values and shows a "Clear focus" action.

### Company routes

- Dashboard CTA:
  - `/company/my-pipeline?focus=tomorrow-plan`
- Pending feedback deep-link:
  - `/company/my-pipeline?focus=needs-feedback`
- Pipeline page supports both focus values and shows a "Clear focus" action.

## How to update safely

### 1) Tune risk/health thresholds

Edit constants/expressions in:

- `src/app/(dashboard)/recruit/page.tsx`
- `src/app/(dashboard)/company/page.tsx`

When changing formulas, update:

- urgency thresholds
- SLA warning condition
- label copy in "Futuristic signals"

### 2) Change focus behavior

Edit filtering logic in:

- `src/app/(dashboard)/recruit/pipeline/page.tsx`
- `src/app/(dashboard)/company/my-pipeline/page.tsx`

If you add a new focus mode:

1. extend union type (`FocusMode`)
2. add parsing from query param
3. add filtering branch
4. add dashboard CTA/deep-link to use it

### 3) Keep route contracts aligned

If route paths change in the sidebar or App Router folders, update all linked CTA targets in:

- recruiter dashboard
- company dashboard
- both pipeline clear-focus buttons

## UI copy guide

Keep copy action-first and time-aware:

- "Tomorrow command center" should remain forecast-oriented
- "Futuristic signals" should describe risk/health and immediate next actions
- SLA warning should be explicit ("likely to breach by tomorrow")

## QA checklist

1. Open recruiter dashboard with mixed pipeline data.
2. Verify urgency badge changes across low/medium/critical scenarios.
3. Verify SLA warning appears when overdue feedback exists.
4. Click "Start tomorrow plan" and confirm filtered pipeline list.
5. Click pending feedback link and confirm only feedback-needed items remain.
6. Repeat 1-5 for company dashboard and company pipeline.
7. Validate "Clear focus" returns full list.

## Known limitations

- Heuristics run fully client-side and are not persisted.
- Tomorrow window uses user local time.
- Pending applications currently uses a `limit=100` pull; large orgs may need a count endpoint for stronger accuracy.

## Suggested next iteration

1. Org-configurable weights/thresholds from settings.
2. Server-side priority scoring endpoint for consistency across clients.
3. Timezone-aware tomorrow window based on organisation settings.
4. SLA target configuration per team or role.
