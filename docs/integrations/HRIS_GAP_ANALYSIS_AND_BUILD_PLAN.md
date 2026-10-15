# HRIS integration gaps: current vs real-world

Last updated: 2026-04-26

## Current state in TigerHire

- HRIS providers can be configured and validated in settings (`hibob`, `bamboohr`, `darwinbox`, `keka`, `workday`).
- Connectivity checks are implemented per provider.
- Integration lifecycle metadata and audit entries are persisted.
- **No operational HRIS data sync is fully implemented yet** (employee pull, requisition pull, hire pushback).

## Real-world expectation (enterprise customers)

| Capability                   | What customers expect                                   | Current status             | Gap                                             |
| ---------------------------- | ------------------------------------------------------- | -------------------------- | ----------------------------------------------- |
| Employee master sync         | Pull people + manager hierarchy + department + location | Not implemented            | Build pull worker + mapping + conflict handling |
| Requisition/headcount sync   | Pull approved requisitions/headcount plans              | Not implemented            | Build requisition pull + mapping + dedupe       |
| Hire pushback                | Push hire status back to HRIS/LMS idempotently          | Not implemented            | Build event-driven pushback worker + retries    |
| Reconciliation report        | Run-level report of matched/missing/failed records      | Started (phase 1 scaffold) | Add record-level counters and mismatch buckets  |
| Operational monitoring       | Run history, status, failure reason, re-run support     | Started (phase 1 scaffold) | Add dashboards, alerts, and replay controls     |
| Mapping governance           | Customer-editable field map with validation             | Not implemented            | Add mapping model + UI + schema checks          |
| Webhook + polling resilience | Event-first with polling fallback                       | Not implemented            | Add webhook consumers and scheduled delta sync  |

## Build phases

### Phase 1 (implemented in this change)

- Introduced HRIS sync run persistence with mode (`dry_run` / `live`) and status tracking.
- Added sync execution API for org admins:
  - `POST /api/settings/org/integrations/hris/sync`
  - `GET /api/settings/org/integrations/hris/sync`
- Added run-level summary payload (connectivity + capability gaps) to establish reconciliation baseline.

### Phase 2 (next)

- Employee pull v1 for one provider (recommended first: BambooHR or HiBob).
- Canonical employee upsert contract (external_id, manager_external_id, dept/location mapping).
- Record-level reconciliation counters (`fetched`, `upserted`, `skipped`, `failed`).

### Phase 3

- Requisition/headcount pull v1 (single provider pilot).
- Conflict policy (source-of-truth and stale data guardrails).
- Scheduled sync + webhook-triggered delta sync.

### Phase 4

- Hire pushback worker (idempotent) + retry/DLQ policy.
- Customer-facing runbook and monitoring panel.
- Production hardening: SLOs, alerting thresholds, and replay tooling.

## Acceptance criteria for “integration operational”

- At least one provider has:
  - employee pull with reconciliation report,
  - requisition/headcount pull,
  - hire pushback with idempotency keying,
  - retry + failure visibility + rerun path,
  - customer UAT sign-off in sandbox and production.
