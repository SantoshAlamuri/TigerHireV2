# Backend-UI Connection Roadmap (Build-Ready)

**Date:** 2026-05-07  
**Owner:** Product + Engineering  
**Scope:** Convert known backend/UI disconnects and hardcoded product logic into implementation-ready work.

---

## Why this document exists

`docs/BACKEND_FRONTEND_AUDIT.md` is useful but partially stale. This roadmap is the current source of truth for:

- backend endpoints that are not wired to UI,
- UI/backend contracts that should be formalized,
- hardcoded logic that should move to shared config or database-backed settings.

---

## Delivery principles

- Keep changes incremental and shippable.
- Do not remove existing routes unless a deprecation plan is approved.
- For each gap, define API contract, UI surface, and acceptance criteria before coding.
- Prefer shared source-of-truth modules over duplicated constants.
- Billing is platform-owned by TigerHire `super_admin`; no company-admin billing UI is in scope.

---

## Priority lanes

## P0 - Revenue, operations, or trust impact

### 1) HRIS sync visibility and controls

- **Current gap:** `/api/settings/org/integrations/hris/sync` exists, but no UI calls.
- **Backend:** `src/app/api/settings/org/integrations/hris/sync/route.ts`
- **Target UI surfaces:** Integrations page(s) in company settings.
- **Build tasks:**
  - Add "Run sync" action.
  - Add "Sync runs history" table (status, started at, completed at, summary).
  - Copy should clearly state if current run is connectivity/reconciliation vs full data sync.
- **Acceptance criteria:**
  - Company admin can trigger sync and view recent runs.
  - UI reflects run outcomes from API response.
  - Empty/error states are clear and actionable.

### 2) Candidate data export UX

- **Current gap:** `GET /api/candidates/data-export` exists but no UI wiring.
- **Backend:** `src/app/api/candidates/data-export/route.ts`
- **Target UI surfaces:** candidate profile/privacy settings.
- **Build tasks:**
  - Add "Export my data" control and download flow.
  - Add request status state if export is async or delayed.
  - Add audit event logging if not already emitted.
- **Acceptance criteria:**
  - Candidate can request and receive an export from UI.
  - Unauthorized users cannot access other candidates' data.
  - Test covers authz, successful export, and server failure.

---

## P1 - Product completeness gaps

### 3) Employee referrals: open positions and refer flow

- **Current gap:** `/api/employees/open-positions` and `/api/employees/refer` appear backend-only.
- **Backend:**
  - `src/app/api/employees/open-positions/route.ts`
  - `src/app/api/employees/refer/route.ts`
- **Target UI surfaces:** employee dashboard referral section.
- **Build tasks:**
  - Load open roles from `/api/employees/open-positions`.
  - Add referral submission form wired to `/api/employees/refer`.
  - Show referral status feedback.
- **Acceptance criteria:**
  - Employee can view open positions and submit referral from UI.
  - Submitted referral is persisted and visible in employee referral history.

### 4) Usage summary and WhatsApp flow-status observability

- **Current gap:** endpoints exist but no obvious dashboard surface.
- **Backend:**
  - `src/app/api/usage/summary/route.ts`
  - `src/app/api/whatsapp/flow-status/route.ts`
- **Target UI surfaces:** admin/company operational dashboards.
- **Build tasks:**
  - Add minimal operational cards/tables for usage and flow health.
  - Define role-based visibility for admin vs org users.
- **Acceptance criteria:**
  - Intended role can access these views.
  - Metrics and status values match API payloads.

---

## P2 - Hardcoded logic debt (stability and maintainability)

### 5) Shared navigation/route policy registry

- **Current issue:** role/path behavior is duplicated in hardcoded maps.
- **Files:**
  - `src/components/dashboard/sidebar-nav-groups.tsx`
  - `src/lib/security/dashboard-route-policy.ts`
- **Build tasks:**
  - Introduce shared typed registry for route metadata + role visibility.
  - Generate both sidebar groups and route access rules from this registry.
  - Add tests to prevent route-policy and nav drift.
- **Acceptance criteria:**
  - One source of truth powers nav + access policy definitions.
  - New route requires update in one place only.

### 6) Agent type/status registry normalization

- **Current issue:** `admin/agents` UI and API rely on hardcoded labels/options/dispatch.
- **Files:**
  - `src/app/(dashboard)/admin/agents/page.tsx`
  - `src/app/api/admin/agents/route.ts`
- **Build tasks:**
  - Create shared typed registry for agent metadata and dispatch capabilities.
  - Use registry in UI filters and backend validation.
  - Keep fallback for unknown legacy agent logs.
- **Acceptance criteria:**
  - UI filters and API accepted values stay aligned by type.
  - Unknown values do not crash UI.

---

## Potentially intentional backend-only routes (verify before building UI)

- `/api/billing/portal` (platform/super-admin owned; intentionally not company-admin facing)
- `/api/cron/*`
- `/api/webhooks/*`
- `/api/scim/v2/*`
- `/api/openapi`
- `/api/signals/ingest`
- `/api/jobs/feed.xml`

These should not be treated as gaps unless product explicitly wants an operator UI.

---

## Implementation template per ticket

For each item above, create tickets with this structure:

1. **Problem statement**
2. **Current endpoints and files**
3. **Target UI surface**
4. **API contract (request/response/error codes)**
5. **RBAC + entitlement rules**
6. **Instrumentation and audit events**
7. **Test plan (unit + route + UI flow)**
8. **Rollout and fallback**

---

## Suggested sprint split

- **Sprint A (P0):** HRIS sync UI, candidate data export.
- **Sprint B (P1):** Employee refer/open-positions, usage summary/WhatsApp status surfacing.
- **Sprint C (P2):** Shared nav/route registry + admin agents registry refactor.

---

## Definition of done for this roadmap

This roadmap is complete when:

- each selected gap is wired end-to-end (UI -> API -> persistence),
- each flow has role-safe access controls,
- each flow has tests for success + failure paths,
- each legacy hardcoded map moved in scope is replaced by shared typed source-of-truth,
- docs explicitly preserve super-admin-only billing ownership.
