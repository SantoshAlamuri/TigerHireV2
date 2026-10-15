# Unified shell migration map (Phase 0)

**Status:** Phase 0 inventory only — no code changes implied.  
**Generated:** 2026-04-17  
**Scope:** `src/app/(dashboard)/recruit/**`, `src/app/(dashboard)/company/**`, `src/app/(dashboard)/agency/**` (agency directory **exists**).  
**Sources:** Glob of `**/page.tsx`, `src/components/dashboard/Sidebar.tsx` (`NAV_GROUPS_BY_ROLE`), `src/lib/security/dashboard-route-policy.ts` (`DASHBOARD_ROUTE_ACCESS_RULES`), `src/features/settings/config/sections.ts`, representative page imports.

**Non-goals (explicit):** No API route moves; no middleware redesign; no Phase 1 implementation in this document.

---

## Executive counts

| Metric                                                                |        Value |
| --------------------------------------------------------------------- | -----------: |
| `page.tsx` files under **recruit**                                    |           31 |
| `page.tsx` files under **company**                                    |           32 |
| `page.tsx` files under **agency**                                     |            9 |
| **Total** leaf dashboard routes inventoried                           |       **72** |
| Pairs with obvious **twin** in another shell (same job, same concept) | ~18 (see §4) |
| Rows flagged **ambiguous** for human decision                         | ~12 (see §5) |

---

## Column legend (per row in §3)

1. **Path** — App Router URL pattern (dynamic segments as `[id]`).
2. **Purpose** — `hiring_workflow` | `settings` | `home` | `billing` | `finance` | `admin_org` | `other`.
3. **Roles** — From `dashboard-route-policy` + Sidebar intent (abbrev.: `rec` recruiter, `ca` company_admin, `hm` hiring_manager, `fin` finance, `int` interviewer, `ag` agency, `sa` super_admin).
4. **Twin** — Equivalent or overlapping route in another shell (`yes + path` / `no` / `partial`).
5. **Proposed bucket** — If hiring workflow → `/hire/...` suggestion; else `/settings/*`, `/admin/*`, `/dashboard/*`, or `ambiguous`.
6. **Divergence** — Different layout, data scope, or RBAC vs twin.
7. **Shared component** — Same component already used across shells (`yes + path` / `no`).

---

## §3 — Route inventory (grouped)

### 3.1 Home / hub

| Path       | Purpose | Roles       | Twin | Proposed bucket                                | Divergence              | Shared |
| ---------- | ------- | ----------- | ---- | ---------------------------------------------- | ----------------------- | ------ |
| `/recruit` | home    | rec, ca, sa | no   | `/dashboard` (recruiter home) or `/hire` entry | Recruiter-only overview | no     |
| `/company` | home    | ca          | no   | `/dashboard` (company admin)                   | Org-wide admin hub      | no     |
| `/agency`  | home    | ag          | no   | `/dashboard` (agency) or `/hire/agency`        | Agency org context      | no     |

### 3.2 Jobs (JD, posting, workspace)

| Path                                    | Purpose         | Roles       | Twin                                              | Proposed bucket                                       | Divergence                                                     | Shared                                      |
| --------------------------------------- | --------------- | ----------- | ------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| `/recruit/jobs`                         | hiring_workflow | rec, ca, sa | partial `/company/jobs`, `/agency/jobs`           | `/hire/jobs`                                          | Agency: client org jobs; company: HM/admin scope               | likely `DashboardShell` only                |
| `/recruit/jobs/new`                     | hiring_workflow | rec, ca, sa | partial twins                                     | `/hire/jobs/new`                                      | Same flow, different prefix                                    | no                                          |
| `/recruit/jobs/[id]`                    | hiring_workflow | rec, ca, sa | partial `/company/jobs/[id]`, `/agency/jobs/[id]` | `/hire/jobs/[id]`                                     | Recruit uses workspace layout + sub-nav; company/agency differ | `RecruitJobWorkspaceLayout` vs company page |
| `/recruit/jobs/[id]/edit`               | hiring_workflow | rec, ca, sa | partial                                           | `/hire/jobs/[id]/edit`                                | Company edit page separate file                                | no                                          |
| `/recruit/jobs/[id]/pipeline-stages`    | hiring_workflow | rec, ca, sa | no (company uses job page tabs?)                  | `/hire/jobs/[id]/pipeline` or `.../stages`            | Naming: `pipeline-stages` vs future unified `pipeline`         | no                                          |
| `/recruit/jobs/[id]/feedback`           | hiring_workflow | rec, ca, sa | no                                                | `/hire/jobs/[id]/feedback`                            | —                                                              | partial shared job APIs                     |
| `/recruit/jobs/[id]/feedback-templates` | hiring_workflow | rec, ca, sa | no                                                | `/hire/jobs/[id]/feedback-templates`                  | —                                                              | no                                          |
| `/recruit/jobs/[id]/matches`            | hiring_workflow | rec, ca, sa | no                                                | `/hire/jobs/[id]/matches`                             | —                                                              | no                                          |
| `/recruit/jobs/[id]/approvals`          | hiring_workflow | rec, ca, sa | no                                                | `/hire/jobs/[id]/approvals`                           | —                                                              | no                                          |
| `/recruit/jobs/[id]/interviews`         | hiring_workflow | rec, ca, sa | partial `/company/interviews`                     | `ambiguous`                                           | Company list is org-wide; job-scoped is recruit                | no                                          |
| `/company/jobs`                         | hiring_workflow | ca, hm      | partial                                           | `/hire/jobs`                                          | HM may be scoped to my-jobs not this list                      | no                                          |
| `/company/jobs/new`                     | hiring_workflow | ca, hm      | partial                                           | `/hire/jobs/new`                                      | —                                                              | no                                          |
| `/company/jobs/[id]`                    | hiring_workflow | ca, hm      | partial                                           | `/hire/jobs/[id]`                                     | Company job detail vs recruit workspace                        | no                                          |
| `/company/jobs/[id]/edit`               | hiring_workflow | ca, hm      | partial                                           | `/hire/jobs/[id]/edit`                                | —                                                              | `RequisitionThreadBanner` may align         |
| `/agency/jobs`                          | hiring_workflow | ag          | partial                                           | `/hire/jobs` (tenant = client) or `/hire/agency/jobs` | Client linkage; **ambiguous** product shape                    | no                                          |
| `/agency/jobs/new`                      | hiring_workflow | ag          | partial                                           | `/hire/jobs/new`                                      | —                                                              | no                                          |
| `/agency/jobs/[id]`                     | hiring_workflow | ag          | partial                                           | `/hire/jobs/[id]`                                     | —                                                              | no                                          |
| `/agency/jobs/[id]/edit`                | hiring_workflow | ag          | partial                                           | `/hire/jobs/[id]/edit`                                | —                                                              | no                                          |

### 3.3 Pipeline, applications, candidates

| Path                               | Purpose           | Roles           | Twin                              | Proposed bucket                                          | Divergence                                         | Shared                |
| ---------------------------------- | ----------------- | --------------- | --------------------------------- | -------------------------------------------------------- | -------------------------------------------------- | --------------------- |
| `/recruit/pipeline`                | hiring_workflow   | rec, ca, sa     | no                                | `/hire/pipeline` or `/hire/jobs/.../pipeline`            | **Canonical org pipeline** linked from company nav | `RecruitPipelineCard` |
| `/recruit/applications`            | hiring_workflow   | rec, ca, sa     | no                                | `/hire/applications`                                     | —                                                  | no                    |
| `/recruit/candidates`              | hiring_workflow   | rec, ca, ag, sa | partial `/agency/candidates/[id]` | `/hire/candidates`                                       | Agency: candidate profile deep-link                | partial               |
| `/recruit/candidates/[id]`         | hiring_workflow   | rec, ca, ag, sa | yes `/agency/candidates/[id]`     | `/hire/candidates/[id]`                                  | Agency vs in-house RBAC                            | likely shared pieces  |
| `/recruit/candidates/[id]/resumes` | hiring_workflow   | rec, ca, sa     | no                                | `/hire/candidates/[id]/resumes`                          | —                                                  | no                    |
| `/company/my-pipeline`             | hiring_workflow   | hm, ca          | no                                | `/hire/pipeline?scope=mine` or `/dashboard/hm/pipeline`  | HM-scoped vs org pipeline                          | **ambiguous**         |
| `/company/pending-resignations`    | other / admin_org | ca              | no                                | `/admin_org/pending-resignations` or stay `/company/...` | Ops/compliance; not core hire path                 | **ambiguous**         |

### 3.4 Requisitions (hiring requests)

| Path                            | Purpose         | Roles           | Twin                               | Proposed bucket           | Divergence                                                                   | Shared                    |
| ------------------------------- | --------------- | --------------- | ---------------------------------- | ------------------------- | ---------------------------------------------------------------------------- | ------------------------- |
| `/recruit/hiring-requests`      | hiring_workflow | rec, ca, hm, sa | partial `/company/hiring-requests` | `/hire/requisitions`      | List UX differs; **detail today is recruit-only URL** for company list links | `RequisitionThreadBanner` |
| `/recruit/hiring-requests/[id]` | hiring_workflow | rec, ca, hm, sa | partial                            | `/hire/requisitions/[id]` | HM edit draft on company/new; recruiter approve on recruit detail            | partial shared API        |

### 3.5 Offers

| Path                    | Purpose         | Roles       | Twin                        | Proposed bucket      | Divergence                    | Shared                               |
| ----------------------- | --------------- | ----------- | --------------------------- | -------------------- | ----------------------------- | ------------------------------------ |
| `/recruit/offers`       | hiring_workflow | rec, ca, sa | partial `/company/offers`   | `/hire/offers`       | Same domain                   | no                                   |
| `/recruit/offers/draft` | hiring_workflow | rec, ca, sa | yes `/company/offers/draft` | `/hire/offers/draft` | Only `offersListHref` differs | **yes** `RecruitOfferDraftWorkspace` |
| `/company/offers`       | hiring_workflow | ca, hm      | partial                     | `/hire/offers`       | HM vs admin capabilities      | no                                   |
| `/company/offers/draft` | hiring_workflow | ca, hm      | yes                         | `/hire/offers/draft` | —                             | **yes** `RecruitOfferDraftWorkspace` |

### 3.6 Approvals, finance, referrals, team, billing

| Path                 | Purpose         | Roles           | Twin | Proposed bucket                        | Divergence                                   | Shared        |
| -------------------- | --------------- | --------------- | ---- | -------------------------------------- | -------------------------------------------- | ------------- |
| `/company/approvals` | hiring_workflow | hm, ca, rec, sa | no   | `/hire/approvals`                      | Used from **recruit** nav too (cross-prefix) | no            |
| `/company/finance`   | finance         | fin, ca, sa     | no   | `/finance/inbox` or `/company/finance` | Not `/hire/*`                                | no            |
| `/company/referrals` | other           | ca              | no   | `/dashboard/referrals` or keep         | Marketing/referral tools                     | **ambiguous** |
| `/company/team`      | admin_org       | ca              | no   | `/settings/team` or `/company/team`    | —                                            | **ambiguous** |
| `/company/billing`   | billing         | ca              | no   | `/settings/billing`                    | —                                            | no            |
| `/company/my-jobs`   | home            | hm, ca          | no   | `/dashboard/hm` or `/hire/my-jobs`     | HM landing                                   | **ambiguous** |

### 3.7 Interviews & assessments & prep

| Path                      | Purpose         | Roles       | Twin                          | Proposed bucket        | Divergence                          | Shared |
| ------------------------- | --------------- | ----------- | ----------------------------- | ---------------------- | ----------------------------------- | ------ |
| `/company/interviews`     | hiring_workflow | int, ca, hm | no                            | `/hire/interviews`     | Org-wide list                       | no     |
| `/recruit/assessments`    | hiring_workflow | rec, ca, sa | yes `/company/assessments`    | `/hire/assessments`    | Interviewer uses company shell only | no     |
| `/company/assessments`    | hiring_workflow | ca, hm, int | yes                           | `/hire/assessments`    | —                                   | no     |
| `/recruit/interview-prep` | hiring_workflow | rec, ca, sa | yes `/company/interview-prep` | `/hire/interview-prep` | —                                   | no     |
| `/company/interview-prep` | hiring_workflow | int, ca, hm | yes                           | `/hire/interview-prep` | —                                   | no     |

### 3.8 Recruiter / HM personal settings (not org settings)

| Path                                | Purpose  | Roles  | Twin                                     | Proposed bucket                      | Divergence                                            | Shared                                      |
| ----------------------------------- | -------- | ------ | ---------------------------------------- | ------------------------------------ | ----------------------------------------------------- | ------------------------------------------- |
| `/company/my-settings`              | settings | hm, ca | no                                       | `/settings/me` or `/profile/company` | Nested offer letters link to **company** org settings | **ambiguous**                               |
| `/company/my-settings/integrations` | settings | hm, ca | partial `/recruit/settings/integrations` | `/settings/me/integrations`          | vs recruit personal integrations                      | **yes** `PersonalCalendarIntegrationsPanel` |

### 3.9 Company org settings (`/company/settings/*`)

| Path                                        | Purpose  | Roles  | Twin                                            | Proposed bucket                             | Divergence                             | Shared                                                         |
| ------------------------------------------- | -------- | ------ | ----------------------------------------------- | ------------------------------------------- | -------------------------------------- | -------------------------------------------------------------- |
| `/company/settings`                         | settings | ca     | no                                              | `/settings/org`                             | Company-only overview                  | **yes** `SettingsModule`                                       |
| `/company/settings/integrations`            | settings | ca     | partial recruit                                 | `/settings/org/integrations`                | Org vs personal                        | **yes** `SettingsModule`, `IntegrationRow`                     |
| `/company/settings/job-boards`              | settings | ca     | no                                              | `/settings/org/job-boards`                  | —                                      | **yes** `SettingsModule`                                       |
| `/company/settings/permissions`             | settings | ca     | no                                              | `/settings/org/permissions`                 | —                                      | **yes** `SettingsModule`, `PermissionsPanel`                   |
| `/company/settings/privacy`                 | settings | ca     | no                                              | `/settings/org/privacy`                     | —                                      | **yes** `SettingsModule`                                       |
| `/company/settings/audit`                   | settings | ca     | no                                              | `/settings/org/audit`                       | —                                      | **yes** `SettingsModule`, `AuditLogTable`                      |
| `/company/settings/pipeline`                | settings | ca     | yes `/recruit/settings/pipeline`                | `/settings/hiring-setup/pipeline`           | `jobsHref` prop differs                | **yes** `OrgPipelineDefaultsPanel`, `SettingsModule`           |
| `/company/settings/offer-letter-templates`  | settings | ca, hm | yes `/recruit/settings/offer-letter-templates`  | `/settings/hiring-setup/offer-letters`      | HM read path                           | **yes** `OfferLetterTemplatesPanel`, `SettingsModule`          |
| `/company/settings/compensation-bands`      | settings | ca     | yes `/recruit/settings/compensation-bands`      | `/settings/hiring-setup/compensation-bands` | —                                      | **yes** `CompensationBandsPanel`, `SettingsModule`             |
| `/company/settings/offer-approval-workflow` | settings | ca     | yes `/recruit/settings/offer-approval-workflow` | `/settings/hiring-setup/offer-approval`     | Recruit also has super_admin in policy | **yes** `OfferApprovalWorkflowSettingsPanel`, `SettingsModule` |

### 3.10 Recruiter settings (`/recruit/settings/*`)

| Path                                        | Purpose  | Roles       | Twin                     | Proposed bucket                             | Divergence                               | Shared                                       |
| ------------------------------------------- | -------- | ----------- | ------------------------ | ------------------------------------------- | ---------------------------------------- | -------------------------------------------- |
| `/recruit/settings`                         | settings | rec, ca, sa | no                       | `/settings/me` or `/settings/recruiter`     | “Overview” in recruit is thin vs company | **ambiguous**                                |
| `/recruit/settings/integrations`            | settings | rec, ca, sa | partial company personal | `/settings/me/integrations`                 | No `SettingsModule` wrapper in recruit   | **yes** `PersonalCalendarIntegrationsPanel`  |
| `/recruit/settings/pipeline`                | settings | rec, ca, sa | yes company              | `/settings/hiring-setup/pipeline`           | Same panel                               | **yes** `OrgPipelineDefaultsPanel`           |
| `/recruit/settings/offer-letter-templates`  | settings | rec, ca, sa | yes                      | `/settings/hiring-setup/offer-letters`      | —                                        | **yes** `OfferLetterTemplatesPanel`          |
| `/recruit/settings/compensation-bands`      | settings | rec, ca, sa | yes                      | `/settings/hiring-setup/compensation-bands` | —                                        | **yes** `CompensationBandsPanel`             |
| `/recruit/settings/offer-approval-workflow` | settings | rec, ca, sa | yes                      | `/settings/hiring-setup/offer-approval`     | —                                        | **yes** `OfferApprovalWorkflowSettingsPanel` |

### 3.11 Recruiter insights & tools

| Path                      | Purpose         | Roles       | Twin | Proposed bucket                  | Divergence                | Shared |
| ------------------------- | --------------- | ----------- | ---- | -------------------------------- | ------------------------- | ------ |
| `/recruit/analytics`      | hiring_workflow | rec, ca, sa | no   | `/hire/analytics` or `/insights` | —                         | no     |
| `/recruit/saved-searches` | hiring_workflow | rec, ca, sa | no   | `/hire/saved-searches`           | —                         | no     |
| `/recruit/verify`         | hiring_workflow | rec, ca, sa | no   | `/hire/verify`                   | Background / verification | no     |

### 3.12 Agency-only

| Path               | Purpose         | Roles | Twin                        | Proposed bucket                             | Divergence                                   | Shared        |
| ------------------ | --------------- | ----- | --------------------------- | ------------------------------------------- | -------------------------------------------- | ------------- |
| `/agency/clients`  | hiring_workflow | ag    | no                          | `/hire/agency/clients` or `/agency/clients` | **ambiguous** whether agency stays top-level | no            |
| `/agency/pipeline` | hiring_workflow | ag    | partial `/recruit/pipeline` | `/hire/pipeline` (context=agency)           | Different data model / tenancy               | partial cards |
| `/agency/team`     | admin_org       | ag    | partial `/company/team`     | `/settings/agency/team` or `/agency/team`   | —                                            | **ambiguous** |

---

## §4 — High-value shared components (convergence “cheap wins”)

| Component                              | Used in (examples)                                                                                                      | Notes                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `RecruitOfferDraftWorkspace`           | `/recruit/offers/draft`, `/company/offers/draft`                                                                        | Route merge is mostly prefix + policy |
| `SettingsModule` + hiring setup panels | `OrgPipelineDefaultsPanel`, `CompensationBandsPanel`, `OfferLetterTemplatesPanel`, `OfferApprovalWorkflowSettingsPanel` | Twin pages already thin wrappers      |
| `PersonalCalendarIntegrationsPanel`    | `/recruit/settings/integrations`, `/company/my-settings/integrations`                                                   | Same shell pattern as offer draft     |
| `RequisitionThreadBanner`              | hiring request detail, job workspace, offer draft                                                                       | Already models “hire thread”          |

---

## §5 — Unclear / needs human decision

1. **Cross-prefix navigation today:** `company_admin` uses `/recruit/pipeline`, `/recruit/candidates`, `/recruit/applications` while living in “company” persona — convergence should decide **one** canonical pipeline URL vs role-scoped query.
2. **Hiring request detail:** List under `/company/hiring-requests` but detail often `/recruit/hiring-requests/[id]` — whether `/hire/requisitions/[id]` is universal or split by role.
3. **Agency under `/hire` vs top-level `/agency`:** Tenant model (client orgs) may warrant keeping `/agency/*` as a separate subtree with shared `/hire` job routes.
4. **HM “My” hub:** `/company/my-jobs`, `/company/my-pipeline`, `/company/my-settings` vs single `/dashboard` with widgets.
5. **Finance:** `/company/finance` is not hiring workflow — keep out of `/hire/*` (align with prompt’s bucket rule).
6. **Interviewer role:** Only `/company/interviews` + `/company/interview-prep` + profile — minimal overlap with recruit.
7. **Recruit `/recruit/settings` “overview”** vs **company settings overview** — different depth; bucket naming (`/settings/me` vs `/settings/org`).
8. **Job workspace parity:** Recruit has rich `RecruitJobWorkspaceLayout` + many sub-routes; company job UX is flatter — Phase 1 must pick **one** job shell or accept role-specific tabs.
9. **Pending resignations:** Product category (HR ops) vs hiring workflow.
10. **Referrals under company:** Marketing/referral program vs hiring — may never move to `/hire/*`.
11. **Notifications / messages / profile:** Global (`/messages`, `/notifications`, `/profile`) — out of scope for `/hire` merge but touch every persona.
12. **Super admin:** `/admin/*` not in this inventory — any `/hire` work must not collide with platform admin.

---

## §6 — Suggested `/hire/*` tree (draft targets for hiring_workflow only)

> Naming is illustrative; final names come after Phase 0 review.

```
/hire/requisitions, /hire/requisitions/[id]
/hire/jobs, /hire/jobs/new, /hire/jobs/[id], /hire/jobs/[id]/edit
/hire/jobs/[id]/pipeline-stages   # or /hire/jobs/[id]/pipeline
/hire/jobs/[id]/feedback, .../feedback-templates, .../matches, .../approvals, .../interviews
/hire/pipeline                      # org default view; agency variant = query or subtree
/hire/applications
/hire/candidates, /hire/candidates/[id], .../resumes
/hire/offers, /hire/offers/draft
/hire/approvals
/hire/assessments
/hire/interview-prep
/hire/analytics, /hire/saved-searches, /hire/verify
```

**Do not place under `/hire/*` without review:** `/company/finance`, `/company/billing`, `/company/team`, `/company/referrals`, `/company/pending-resignations`, `/admin/*`, global `/messages` / `/notifications`.

---

## §7 — Policy alignment notes

- **`DASHBOARD_ROUTE_ACCESS_RULES`** already encodes several **cross-shell** paths (e.g. `/recruit/candidates` allows `agency`; `/recruit/hiring-requests` allows `hm`).
- **`NAV_GROUPS_BY_ROLE`** embeds **hard-coded** `/recruit/...` links inside `company_admin` and `hiring_manager` groups — Phase 2 internal-link pass must update these to whatever canonical tree is chosen.

---

## §8 — Next step (Phase 1 gate)

1. Resolve §5 items in a short design note (1–2 pages).
2. Lock **canonical** paths for: pipeline, hiring request detail, agency jobs, HM my-work.
3. Only then start Phase 1 parallel routes + shared layout extraction.

---

_End of Phase 0 map._
