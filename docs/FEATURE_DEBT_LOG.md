# Feature Debt Log

Last updated: 2026-04-18

Purpose: track known feature debt that is intentionally deferred, with enough context to prioritize and close safely.

## Open Items

- Name: Offer state transition collapse (`approved` -> `sent`)
  - Area: Offer workflow
  - Impact: Medium
  - Status: Open
  - Owner: Unassigned
  - Notes: Temporary dual-state handling remains in code paths; simplify to a single canonical transition and update downstream reporting/tests.

- Name: Deploy-time migration automation
  - Area: CI/CD and database operations
  - Impact: High
  - Status: Open
  - Owner: Unassigned
  - Notes: Wire migration apply + behavior tests into release flow to prevent schema drift between staging and production.

- Name: Candidate pipeline state machine completion
  - Area: Hiring request lifecycle
  - Impact: High
  - Status: Open
  - Owner: Unassigned
  - Notes: Close lifecycle gap between `POSTED` and `OFFER_DRAFT` with explicit states, guards, and transition tests.

- Name: SSO policy read fallback warning cleanup
  - Area: Auth / company SSO enforcement
  - Impact: Medium
  - Status: Open
  - Owner: Unassigned
  - Notes: Live behavior tests show warnings when `organisations.enforce_sso` column is missing in target schema; align schema and cleanup fallback path.

- Name: Marketing agent skill implementation
  - Area: Growth tooling
  - Impact: Low
  - Status: Open
  - Owner: Unassigned
  - Notes: Parked item from earlier planning; implement only when growth ops are prioritized.

## Update Rule

When adding or modifying feature work:

1. Add newly deferred debt here in the same PR.
2. Update `Last updated`.
3. Move resolved items to a short "Closed Items" section (optional) with resolution date.
