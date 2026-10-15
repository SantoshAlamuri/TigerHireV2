# Product complete-first backlog

Use this to sequence work so the app feels **intentional and complete** (trust, flow, clarity) **before** investing in deep integrations. Technical ATS gaps stay in [ATS-PARTIAL-GAPS-BACKLOG.md](./ATS-PARTIAL-GAPS-BACKLOG.md) and the living feature inventory.

## Guiding rule

- **Do not** ship UI that promises what the system cannot do (e.g. a “Create job” path that only explains requisitions is fine; a primary “New job (manual)” that is disabled elsewhere is not).
- Every list page should have a **credible error state (with retry)**, a **skeleton or spinner**, and an **empty state** that explains the real workflow and next action.

## Priority tiers

### P0 — Surface & trust (visible in every session)

- Consistent **DashboardShell** titles, subtitles, and action placement.
- **Empty and error** patterns (retry, support copy) on: hiring requests, jobs, pipeline, candidate lists, org overview.
- **Honest copy** for constrained flows requisitions → jobs, apply, screening, approvals.
- **Loading** that does not flash “empty” before data loads (skeletons where it matters).

### P1 — End-to-end coherence

- **Primary paths** that match marketing: apply → application → stage → notifications (even if a subset of integrations).
- **Recruiter vs hiring manager** visibility: show the same facts where the role is allowed, or a clear “ask your admin” CTA.
- **Settings and org** pages aligned with what exists in the API (webhooks, branding, team).

### P2 — Depth & parity (after P0–P1)

- Funnel, exports, bulk tools, and vendor integrations, as tracked in the ATs partial backlog and feature inventory.

## Sequencing with integrations

Build **integrations** (SSO, HRIS, job boards) **after** P0 empty/error/copy pass and P1 main flows read as one product, unless a specific integration is the only way to close a live deal and is scoped to one surface.

**Sprint sequencing (P0+):** [SPRINT-PLAN-BACKLOG-TO-DONE.md](./SPRINT-PLAN-BACKLOG-TO-DONE.md) (Sprint 0 exit includes this file’s P0 list).

Last updated: 2026-04-24
