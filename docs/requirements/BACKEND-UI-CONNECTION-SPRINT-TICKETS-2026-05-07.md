# Backend-UI Connection Sprint Tickets (No Company Admin Billing)

**Date:** 2026-05-07  
**Scope lock:** Billing remains platform-owned by TigerHire `super_admin`; company-admin billing UI is out of scope.

This document translates the roadmap into implementation-ready sprint tickets.

---

## Sprint 1 (Tracks A + B)

## Ticket A1 - HRIS Sync Controls in Company Integrations

### Problem statement

`/api/settings/org/integrations/hris/sync` exists, but company admins cannot run sync or view run history in UI.

### Current endpoints and files

- API: `src/app/api/settings/org/integrations/hris/sync/route.ts`
- UI candidate surface: `src/app/(dashboard)/company/settings/integrations/page.tsx`
- Supporting logic (if needed for copy/state): `src/lib/integrations/hris/sync.ts`

### Target UI surface

- Add an "HRIS Sync" block under company integrations with:
  - "Run sync" action
  - run history table (`status`, `started_at`, `completed_at`, summary)
  - clear wording that current behavior is reconciliation/connectivity if full sync is not yet available

### API contract

- `GET /api/settings/org/integrations/hris/sync`
  - returns list of sync runs
- `POST /api/settings/org/integrations/hris/sync`
  - triggers a sync run
  - returns run metadata/result summary
- Standard error mapping for `401`, `403`, `422`, `500`

### RBAC and entitlement

- Company admin only (as enforced by route + page guards)
- Non-company-admin users must not see control or access data

### Instrumentation and audit events

- Log sync trigger with org/user context
- Log completion/failure state for traceability
- Add product event for `hris_sync_triggered` and `hris_sync_result_viewed` if analytics is used

### Test plan

- Route tests: authz + successful POST + failure paths
- Component tests: render states (empty/loading/error/success), trigger flow, table rendering
- Optional integration test: sync trigger updates visible list after refresh

### Rollout and fallback

- Feature-flag the UI block if rollout needs control
- Keep existing API behavior unchanged so rollback is UI-only

### Acceptance criteria

- Company admin can trigger HRIS sync from UI
- Company admin can view recent run history and status
- UI messaging accurately describes current sync capability

---

## Ticket B1 - Candidate Data Export UX

### Problem statement

`GET /api/candidates/data-export` exists but candidate UI does not expose export request/download flow.

### Current endpoints and files

- API: `src/app/api/candidates/data-export/route.ts`
- UI candidate surfaces:
  - `src/app/(dashboard)/candidate/profile/page.tsx`
  - potentially related privacy controls in candidate settings

### Target UI surface

- Add "Export my data" control in candidate privacy/profile
- Trigger export request and show state (`requested`, `processing`, `ready`, `failed`) based on API response model

### API contract

- `GET /api/candidates/data-export`
  - returns export payload/file metadata or direct response (per current implementation)
- Standard error mapping for `401`, `403`, `404/422`, `500`

### RBAC and entitlement

- Candidate can export own data only
- Cross-candidate access must remain forbidden

### Instrumentation and audit events

- Add event: `candidate_data_export_requested`
- Add event: `candidate_data_export_completed` / `candidate_data_export_failed`
- Ensure audit trail for DSR/compliance references

### Test plan

- Route tests: own-data allowed, other-user denied, server failure
- UI tests: button state, pending/success/error messaging
- End-to-end smoke: candidate can request export from profile

### Rollout and fallback

- Ship behind candidate privacy feature toggle if desired
- Fallback is hide button while preserving route

### Acceptance criteria

- Candidate can request/export own data from UI
- Unauthorized access remains blocked
- Success and error states are user-readable and test-covered

---

## Sprint 2 (Tracks C + D)

## Ticket C1 - Employee Open Positions and Referral Submit Wiring

### Problem statement

Employee referral endpoints exist but are not fully surfaced in employee dashboard workflows.

### Current endpoints and files

- APIs:
  - `src/app/api/employees/open-positions/route.ts`
  - `src/app/api/employees/refer/route.ts`
- UI candidate surfaces:
  - `src/app/(dashboard)/employee/page.tsx`
  - `src/app/(dashboard)/dashboard/referrer` related components (if shared referral UI is reused)

### Target UI surface

- Employee referral section with:
  - open positions list from API
  - referral form submission to API
  - user feedback on submit result and validation errors

### API contract

- `GET /api/employees/open-positions`
  - returns open roles the employee can refer into
- `POST /api/employees/refer`
  - accepts referral payload and persists referral
- Standard error mapping for `401`, `403`, `422`, `500`

### RBAC and entitlement

- Employee-only access for employee dashboard referral flow
- If shared referrer flow supports additional roles, enforce role-specific UI and backend checks

### Instrumentation and audit events

- Event: `employee_open_positions_viewed`
- Event: `employee_referral_submitted`
- Event: `employee_referral_submission_failed`

### Test plan

- Route tests: open positions authz, refer payload validation, successful submit
- UI tests: list rendering, submit success, submit validation errors
- Integration test: submitted referral appears in employee referral history endpoint

### Rollout and fallback

- Roll out by role guard only
- Fallback is hide action while keeping API stable

### Acceptance criteria

- Employee can browse open roles and submit referrals from UI
- Referral write path is confirmed and visible in employee history
- Error handling and validation are consistent and test-covered

---

## Ticket D1 - Usage Summary and WhatsApp Flow Status Operator Surfaces

### Problem statement

`/api/usage/summary` and `/api/whatsapp/flow-status` exist but do not have clear operator-facing UI surfaces.

### Current endpoints and files

- APIs:
  - `src/app/api/usage/summary/route.ts`
  - `src/app/api/whatsapp/flow-status/route.ts`
- Candidate UI surfaces for extension:
  - `src/app/(dashboard)/admin` pages
  - operational dashboard sections for super admin

### Target UI surface

- Add lightweight operations section/cards showing:
  - usage summary metrics
  - WhatsApp flow health/status snapshot
- Add links to deeper diagnostics if available

### API contract

- `GET /api/usage/summary`
  - aggregate usage metrics for intended operator scope
- `GET /api/whatsapp/flow-status`
  - current flow-state/health snapshot
- Standard error mapping for `401`, `403`, `500`

### RBAC and entitlement

- Primary visibility: `super_admin`
- Any org-level visibility must be explicitly scoped and approved

### Instrumentation and audit events

- Event: `ops_usage_summary_viewed`
- Event: `ops_whatsapp_flow_status_viewed`
- Error telemetry on failed fetch/render

### Test plan

- Route tests: authz and payload stability
- UI tests: cards/tables render, empty state, error state
- Optional contract tests to detect payload shape drift

### Rollout and fallback

- Launch as read-only operator UI
- Fallback is hide section if endpoint instability appears

### Acceptance criteria

- Super admin can view usage summary and WhatsApp flow status in dashboard
- Data shown matches API payload semantics
- Permission boundaries are enforced and tested

---

## Sprint 3 (Track E)

## Ticket E1 - Shared Navigation and Route-Policy Registry

### Problem statement

Role/path definitions are duplicated between sidebar navigation and access policy logic, increasing drift risk.

### Current files

- `src/components/dashboard/sidebar-nav-groups.tsx`
- `src/lib/security/dashboard-route-policy.ts`

### Target design

- Create one typed registry module (for example under `src/lib/navigation/`) containing:
  - route prefix
  - allowed roles
  - nav metadata (label/icon/group/visibility)
- Derive:
  - sidebar groups from registry
  - `DASHBOARD_ROUTE_ACCESS_RULES` from registry

### Migration plan

1. Introduce registry with parity mapping for existing paths.
2. Convert one consumer at a time:
   - first route-policy
   - then sidebar groups
3. Remove duplicate hardcoded maps once parity tests pass.

### RBAC and safety

- Behavior must remain identical for all current roles:
  - `super_admin`, `company_admin`, `recruiter`, `hiring_manager`, `interviewer`, `finance`, `agency`, `employee`, `candidate_*`
- No broadening of access as part of refactor.

### Instrumentation

- Log unexpected registry parse/runtime errors in dashboard boot path.

### Test plan

- Snapshot/equality tests comparing old vs derived role-access outputs.
- Route-policy tests for representative protected paths by role.
- Sidebar visibility tests by role.

### Rollout and fallback

- Ship behind internal config switch if needed (`useUnifiedDashboardRegistry`).
- Fallback path retains legacy maps until confidence is established.

### Acceptance criteria

- One canonical typed registry defines role + route behavior.
- Sidebar and route-policy consume shared data.
- Existing access and nav behavior remains unchanged.

---

## Ticket E2 - Admin Agents Registry Alignment (UI + API)

### Problem statement

Agent names/status labels/options and API dispatch validation are hardcoded in multiple places.

### Current files

- `src/app/(dashboard)/admin/agents/page.tsx`
- `src/app/api/admin/agents/route.ts`

### Target design

- Create shared registry module (for example `src/lib/agents/registry.ts`) with:
  - agent key
  - label
  - run eligibility/action capabilities
  - optional default filters
- Use it in:
  - admin agents UI filter options + labels
  - backend request validation and dispatch guards

### Migration plan

1. Add registry with current keys as-is (no behavior change).
2. Replace UI constants (`AGENT_TYPE_LABELS`, filter options) with registry selectors.
3. Replace API validation/allowlist checks with registry-backed checks.
4. Preserve fallback display for unknown historical agent names in logs.

### RBAC and safety

- `super_admin` permissions remain unchanged.
- Prevent invalid agent invocation by validating against registry.

### Instrumentation

- Log rejected unknown agent invocations with bounded reason.

### Test plan

- UI tests: labels/options generated from registry.
- API tests: valid agent accepted, invalid agent rejected, restart path compatible.
- Regression test: unknown legacy `agent_name` in log still renders safely.

### Rollout and fallback

- Keep compatibility adapter for old constants during first deploy.
- Fallback: switch back to legacy constants if registry issue is detected.

### Acceptance criteria

- UI and API accepted agent keys are aligned by one source-of-truth module.
- Unknown legacy data does not break pages.
- Validation and dispatch behavior is stable and test-covered.
