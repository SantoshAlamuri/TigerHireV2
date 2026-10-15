# Features and Test Cases (E2E + Vitest)

This document maps the features built in the current release wave to concrete test cases.

Use it as:

- a QA checklist before release
- a source of truth for what should be covered in Playwright E2E and Vitest
- a gap tracker for tests that should be added next

## How to run tests

```bash
# Vitest: unit + component + functional
npx vitest run

# Only settings-related vitest suites
npx vitest run tests/unit/settings tests/component/settings tests/functional/settings

# Entitlements unit suite
npx vitest run tests/unit/entitlements.test.ts

# E2E settings + personal settings flow
npx playwright test e2e/settings.spec.ts e2e/settings-to-interview.spec.ts e2e/personal-settings.spec.ts

# E2E admin entitlements flow
npx playwright test e2e/admin-entitlements.spec.ts
```

## 1) Settings Platform (Organisation + Personal)

### Built features

- Organisation settings shell with sidebar sections: integrations, job boards, permissions, privacy, audit
- Provider framework for API key and OAuth providers (calendar, video, transcription, email, job boards)
- Org-level integrations API with masked secrets and disconnect support
- Personal calendar integrations (recruit and hiring manager paths)
- Privacy settings (consent + recording/transcript retention)
- Role-permission settings for integrations/privacy/audit/offers/assessments/template management
- Audit log for settings events

### E2E test cases (Playwright)

- `e2e/settings.spec.ts`
  - Admin can open Integrations/Privacy/Job Boards/Audit pages
  - Non-admin is redirected/blocked from company settings routes
- `e2e/settings-to-interview.spec.ts`
  - Admin can open integration config form, toggle secret visibility, and enter API key
  - Admin can edit privacy fields
  - Audit screen is reachable
- `e2e/personal-settings.spec.ts`
  - Recruiter can access `/recruit/settings/integrations` and see personal calendars
  - Hiring manager can access `/company/my-settings/integrations` and see personal calendars

### Vitest test cases

- Functional API: `tests/functional/settings/api.test.ts`
  - GET integrations returns masked keys (no `secret_ref` leakage)
  - POST integration writes secret + audit log
  - Invalid provider payload returns 422
  - DELETE integration validates provider and writes disconnect audit
  - Privacy GET/POST behavior and validation
  - Audit GET returns entries
- Unit: `tests/unit/settings/integrations.repository.test.ts`
  - Secret masking behavior
  - Org-scoped select and upsert conflict semantics
- Unit: `tests/unit/settings/integrations.validation.test.ts`
  - Provider enum and payload validation constraints
- Unit: `tests/unit/settings/resolve-integration.test.ts`
  - User-first personal calendar resolution with org fallback
- Component:
  - `tests/component/settings/ApiKeyForm.test.tsx`
  - `tests/component/settings/IntegrationRow.test.tsx`
  - `tests/component/settings/OAuthConnectButton.test.tsx`
  - `tests/component/settings/StatusPill.test.tsx`

## 2) Offers Workflow

### Built features

- Offer creation with role/capability gating
- Finance approval endpoint (approve/reject)
- Send offer endpoint (only approved offers)
- Candidate response endpoint (accept/decline/counter)
- Offer expiry cron to auto-expire sent offers after `expires_at`
- Notifications on finance decisions, sent offers, and candidate responses
- Company offers dashboard page

### E2E test cases to add

- Company admin/recruiter creates offer from an application
- Finance role approves and rejects offers
- Recruiter sends only approved offers
- Candidate sees sent offer and submits accept/decline/counter
- Expired offers block response with proper message
- Unauthorized role gets 403 for finance/send endpoints

### Vitest test cases to add

- `POST /api/offers`:
  - 401 unauthenticated, 403 unauthorized role/capability disabled
  - 404 invalid application, 201 success
  - finance notification dispatch check
- `POST /api/offers/[id]/finance`:
  - non-finance 403
  - invalid state 409
  - approve/reject updates status and writes approval row
- `POST /api/offers/[id]/send`:
  - only approved sends, expired 409, candidate notification fired
- `POST /api/offers/[id]/response`:
  - only candidate owner can respond
  - state transitions: sent -> accepted/declined/approved(counter)
  - expired -> 410
- `GET /api/cron/offer-expiry`:
  - cron auth failure 401
  - sent offers older than expiry move to `expired`

## 3) Assessments Workflow

### Built features

- Assessment creation for enterprise roles with capability checks
- Assessment submission by candidate
- Reviewer/interviewer scoring with percentage calculation
- Optional auto-advance when pass threshold is met
- Candidate assessments dashboard
- Company assessments page reusing recruiter assessments module
- Assessments workspace reframed into overview, create center, evaluation inbox, delivery monitor, and template studio
- Builder copy now explicitly limits the live create flow to written and take-home assessments until broader types are wired end-to-end

### E2E test cases

- `e2e/assessments-prep-risks.spec.ts`
  - Recruiter sees create center + evaluation inbox structure on the assessments workspace
  - Assessments builder communicates that written/take-home are the live supported types
  - Unsupported assessment types are not exposed in the live create flow
- Add next:
  - Recruiter/company admin creates an assessment for a candidate
  - Candidate sees pending assessment and submits text or URL
  - Reviewer scores submitted assessment and sees computed score %
  - Auto-advance scenario (pass threshold reached) updates pipeline stage
  - Deadline-passed assessment blocks submission with conflict/error state

### Vitest test cases to add

- `GET/POST /api/assessments`:
  - candidate-only fetch path returns own application assessments
  - enterprise role and capability gates for create
  - create flow remains aligned with the currently validated written/take-home schema
  - share delivery for email/whatsapp channels
- `POST /api/assessments/[id]/submit`:
  - ownership check, deadline check, pending-only state machine
- `POST /api/assessments/[id]/score`:
  - submitted-only scoring, percentage math, auto-advance call behavior
- Validation schemas (`src/lib/validations/assessments.ts`) for type/deadline/submission constraints

## 4) Public Assessment Share Links

### Built features

- Tokenized public assessment page: `/assessments/[token]`
- Share token lookup endpoint
- Token-based submission endpoint
- Share utilities for email/WhatsApp delivery
- Optional WhatsApp phone binding check on submission

### E2E test cases to add

- Open valid share link and submit successfully
- Invalid token returns "not found"
- Expired token blocks submit
- Already-submitted token blocks repeat submission
- Submission requires at least text or URL

### Vitest test cases to add

- `GET /api/assessments/share/[token]`: 404, 410, 200 paths
- `POST /api/assessments/share/[token]/submit`: validation and pass-through error mapping
- `submitAssessmentByToken`:
  - pending-only state transitions
  - deadline enforcement
  - requester phone mismatch -> 403
  - web vs whatsapp metadata behavior

## 5) Assessment Templates

### Built features

- CRUD-like template management (`GET`, `POST`, `PATCH`, soft `DELETE`)
- Org/capability gated management (`manage_assessment_templates`)
- Active-only reads and soft archive behavior

### E2E test cases to add

- Template list loads for allowed roles
- Allowed role can create and edit template
- Delete archives template (disappears from active list)
- Disabled role receives access denied state

### Vitest test cases to add

- `GET /api/assessment-templates`: canManageTemplates flag and active templates
- `POST /api/assessment-templates`: validation + capability gating
- `PATCH /api/assessment-templates/[id]`: partial update + empty payload 400
- `DELETE /api/assessment-templates/[id]`: soft-delete semantics and 404 path

## Interview Prep Workspace

### Built features

- Interview prep workspace reframed into prep queue, prep context, execution handoff, and saved studio
- Composed prep backend aggregates pipeline, FitScore, assessments, and prior feedback into candidate-specific prep packs
- Saved interview prep templates can be created, edited, archived, and merged with generated suggested tracks
- Existing interviewer queue now links directly into prep packs instead of duplicating prep content in a separate flow

### E2E test cases

- `e2e/assessments-prep-risks.spec.ts`
  - Recruiter sees candidate-specific prep context rendered from the composed backend
  - Saved prep templates appear alongside suggested tracks in the studio
  - Existing interviewer queue links into the prep pack/workspace rather than introducing a duplicate prep surface
- Add next:
  - Hiring manager can open prep pack deep-links from company interview workflows
  - Recruiter can create a saved prep template from the current prep pack and see it persist after reload
  - Interviewer sees prep workspace in navigation and can open a linked prep pack for an assigned interview

### Vitest test cases to add

- `GET /api/interview-prep`:
  - recruiter/company/hiring manager/interviewer role gating
  - selected pipeline candidate returns the expected prep pack
  - saved templates are merged ahead of suggested tracks when role/stage match
  - missing prep-template schema falls back cleanly without breaking prep packs
- `GET/POST/PATCH/DELETE /api/interview-prep/templates`:
  - capability gating for template management
  - interviewer can read saved templates but cannot mutate them
  - archive path soft-deletes and removes templates from active reads

## 6) SCIM + Entra Identity Sync

### Built features

- SCIM Users endpoints (`GET/POST` collection, `GET/PATCH/DELETE` by id)
- SCIM Groups endpoints with tenant header support
- Bearer token protection for SCIM endpoints
- SCIM event logging + auth profile cache invalidation
- Entra sync webhook for bulk role mapping and active-state updates

### E2E test cases to add

- SCIM bearer failure -> 401
- Create/update/deactivate SCIM user through API journey
- Group mapping read/write scoped by `x-scim-organisation-id`
- Entra sync payload updates roles and active state for multiple users

### Vitest test cases

- Existing: `tests/unit/scim-groups-route.test.ts`
  - 401 invalid bearer
  - tenant-header filtered group list
  - missing tenant header validation for POST
  - not-found handling for scoped group lookup
- Add:
  - users route tests for list filters, create, patch ops, delete/deactivate
  - entra sync tests for auth, mapping replacement, deactivation counts
  - SCIM event logging failure should not crash request flow

## 7) Analytics CSV Export

### Built features

- `/api/analytics/export` with metric-specific CSV exports:
  - `pipeline`, `sources`, `time_to_hire`, `activity`, `boards`, `overview`
- CSV escaping and attachment headers
- Role-based access checks and org scoping
- Optional date filters for activity/boards exports

### E2E test cases to add

- Export each metric from analytics UI and verify file download starts
- Unsupported metric request returns handled error
- Non-authorized role denied export

### Vitest test cases

- Existing: `tests/unit/analytics-export-route.test.ts`
  - 401 unauthenticated
  - unsupported metric 400
  - boards filters (`from`/`to`) and CSV output
  - overview CSV content + filename
- Add:
  - role matrix (forbidden role)
  - query error path -> 500 mapping
  - CSV escaping edge cases (quotes, commas, newlines)

## 8) Interview Scheduling Reliability Improvements

### Built features

- Booking and rescheduling routes now include stronger role checks and error handling
- Integration resolution hooks for calendar + infra providers during scheduling flows
- Atomic scheduling migration support for slot handling

### E2E test cases to add

- Recruiter books slot successfully and sees interview scheduled
- Recruiter reschedules to new slot and old slot becomes available
- Booking blocked for occupied slot
- Candidate role blocked from booking/rescheduling

### Vitest test cases

- Existing:
  - `tests/unit/jobs-interviews-book-route.test.ts`
  - `tests/unit/jobs-interviews-reschedule-route.test.ts`
- Covered scenarios include:
  - 401/403 auth-role guards
  - required payload fields
  - slot not found/already booked/current slot invalid/new slot unavailable
  - successful booking/rescheduling
  - failed update paths and job-not-found behavior

## 9) Team Management Bulk Invites

### Built features

- Team management UI supports CSV bulk upload entrypoint
- Bulk members API import path with pending-invite skip behavior and invite email dispatch

### E2E test cases to add

- Company admin opens team page, uploads CSV, sees created/ignored summary
- Invalid row formatting produces row-level errors
- Non-admin blocked from bulk import action

### Vitest test cases

- Existing:
  - `tests/component/TeamManagementContent.test.tsx`
  - `tests/functional/organisations/members.bulk.api.test.ts`
- Covered scenarios:
  - bulk modal opens from UI action
  - CSV import accepts rows, skips pending invite, creates/sends expected invite count

## 10) Dashboard Intelligence (Recruit + Company)

### Built features

- Tomorrow command center cards
- Urgency bands and SLA warning heuristics
- Focus routing for pipeline (`focus=needs-feedback` / `focus=tomorrow-plan`)
- Clear-focus behavior in recruiter/company pipelines

### E2E test cases to add

- Recruit and company dashboards render urgency band and warning states
- "Start tomorrow plan" route applies focused filtering
- Pending-feedback deep link applies needs-feedback filter
- Clear focus resets list

### Vitest test cases to add

- Pure-function extraction tests for risk/health calculations and urgency thresholds
- Query-param parser tests for supported focus modes and invalid fallback
- Pipeline filter tests for both focus modes

## 11) Organisation Feature Entitlements (Plan + Overrides)

### Built features

- Plan-level feature entitlements managed via admin plan limits
- Organisation-level feature override controls from admin organisations page
- Global feature flags clarified as kill switches (not org entitlement controls)
- Strict enforcement for expensive paths (FitScore batch + admin agent run trigger path)
- Soft UI gating for lower-risk nav paths (assessments/offers/interview prep)

### E2E test cases (Playwright)

- `e2e/admin-entitlements.spec.ts`
  - Plan limits page exposes entitlement feature controls per plan
  - Organisations page opens per-org feature controls modal
  - Feature flags page communicates global kill-switch semantics

### Vitest test cases

- `tests/unit/entitlements.test.ts`
  - Global kill-switch deny path
  - No-org fallback allow path
  - Plan-default entitlement resolution
  - Org override precedence over plan default

## Release sign-off checklist

- Run all existing settings, analytics, SCIM, scheduling, and team-management suites
- Run admin entitlements suites (`tests/unit/entitlements.test.ts`, `e2e/admin-entitlements.spec.ts`)
- Add missing offer/assessment/template/share-link tests before production release
- Ensure at least one E2E happy path exists for every user-facing feature above
- Ensure at least one Vitest failure-path test exists for every mutating API route above

## Execution status (live checklist)

Status key:

- `[x]` Complete (frontend + backend + tested)
- `[-]` Built, partially tested / debt in progress
- `[ ]` Pending
- `[!]` Blocked

### Feature status matrix

- `[x]` **Settings Platform (Organisation + Personal)** — frontend built, backend built, Vitest green, Playwright settings suites green.
- `[x]` **Team Management Bulk Invites** — existing component + functional tests green.
- `[x]` **Analytics CSV Export** — unit route tests green.
- `[x]` **Interview Scheduling Reliability** — booking/reschedule unit suites green.
- `[x]` **SCIM + Entra Identity Sync** — groups + users + Entra sync unit suites green.
- `[x]` **Offers Workflow** — offers routes unit coverage added and green; company offers happy-path page check added in Playwright.
- `[x]` **Assessments Workflow** — assessments create/submit/score route coverage added and green; recruiter assessments happy-path page check added in Playwright.
- `[x]` **Public Assessment Share Links** — share token routes + submission service coverage added and green; public share invalid-token behavior covered in Playwright.
- `[x]` **Assessment Templates** — template GET/POST/PATCH/DELETE route coverage added and green.
- `[x]` **Dashboard Intelligence** — focus-mode filtering regression tests added (component) and deep-link focus behavior validated in Playwright.
- `[x]` **Organisation Feature Entitlements** — plan-level controls + org overrides + admin/playwright/unit coverage added.

### Frontend debt checklist

- `[x]` Replace brittle OAuth href assertions with URL-aware checks.
- `[x]` Stabilize Playwright execution in this workflow (local runs validated with deterministic command wrapper).
- `[-]` Consolidate shared settings rendering/permission patterns across role-specific pages (functional debt remains; no refactor in this pass).
- `[x]` Add dashboard intelligence regression tests for focus-link behavior.

### Backend debt checklist

- `[x]` Decouple settings functional tests from Supabase admin env dependency via mocking.
- `[x]` Add role/capability matrix tests for offers/assessments/templates/SCIM users.
- `[x]` Add state-transition invariant tests for offers and assessments.
- `[x]` Add cron/integration/identity failure-path resiliency tests.

### Verification evidence (latest run)

- Vitest consolidated feature bundle: `22` files, `102` tests passed.
- Playwright consolidated feature bundle: `16` tests passed.
