# Codebase Audit Delta — 2026-04-18 (Post-Remediation)

**Baseline:** [audit-2026-04-18.md](./audit-2026-04-18.md). **Follow-up scorecard:** [audit-2026-04-18-refresh.md](./audit-2026-04-18-refresh.md).

This report captures the delta from `docs/audit-2026-04-18.md` after the sequential P0–P3 remediation work completed in this thread.

## Snapshot Summary

- P0: major hardening items completed; historical/architecture-level security items remain.
- P1: substantially reduced; FK indexing and behavior-test coverage improved, but not fully exhausted.
- P2: query/pagination cleanup significantly advanced, including full removal of `select("*")` in API/services/repositories scopes used by the original P2 track.
- P3: operationally closed for skip/only + runtime `console.log`; env/doc parity improved but not fully complete.

## Before vs After (Key Metrics)

| Area                                                          | Baseline (audit-2026-04-18) |                            Current | Status                                 |
| ------------------------------------------------------------- | --------------------------: | ---------------------------------: | -------------------------------------- |
| Mutating routes without detected Zod validation               |                          65 |                39 (heuristic scan) | Improved                               |
| FK index gaps (heuristic)                                     |                          79 |               Not fully re-counted | Improved (2 migrations added)          |
| SECURITY DEFINER behavior-test evidence gap                   |                          28 |               Not fully re-counted | Improved (new behavior tests)          |
| RLS policy behavior-test evidence gap                         |                         158 |               Not fully re-counted | Improved (new/extended behavior tests) |
| `.select("*")` in API/services/repositories (P2 target scope) |                         123 |                                  0 | Closed (target scope)                  |
| `.select("*")` across all `src/**`                            |                         n/a | 57 (outside original target scope) | Open (broader refactor scope)          |
| List endpoints lacking pagination (heuristic)                 |                          63 |               Not fully re-counted | Improved                               |
| `.skip` / `.only` in tests                                    |                           8 |                                  0 | Closed                                 |
| `console.log` in `src/**`                                     |                           2 |           1 (comment/example only) | Closed for runtime usage               |
| Missing env parity keys (heuristic)                           |                         106 |              89 (strict key parse) | Improved                               |
| Behavior test files (`*.behavior.test.ts`)                    |                           3 |                                  5 | Improved                               |

## P0 Status

### Completed

- SECURITY DEFINER hardening migration(s) and grant/search_path tightening.
- Security-invoker hardening for reporting views.
- Export audit logging for flagged export routes.
- Explicit deny RLS policy coverage with integration checks.

### Still Pending

- Historical migration hygiene findings (for example "RLS enabled in same migration as table create") remain as audit/history debt.
- Cross-tenant leakage heuristics across broad API surface still need deeper route-by-route policy validation.

## P1 Status

### Completed / Added

- New FK index migration:
  - `supabase/migrations/20260418230000_add_missing_fk_indexes_p1.sql`
- Auto-add migration for unindexed foreign keys:
  - `supabase/migrations/20260418233000_auto_index_unindexed_foreign_keys.sql`
- Security behavior tests:
  - `tests/integration/security-definer-hardening.behavior.test.ts`
  - `tests/integration/rls-explicit-deny-tables.behavior.test.ts` (extended)

### Still Pending

- Exhaustive verification that all audit-flagged FK index heuristics are resolved.
- Full behavior coverage against entire RLS/security-definer policy surface (current tests are representative, not exhaustive).

## P2 Status

### Completed

- Removed wildcard selects in high-impact routes/services/repositories from original P2 scope:
  - `src/app/api/**`
  - `src/lib/services/**`
  - `src/lib/repositories/**`
- Added/standardized pagination in additional list endpoints.

### Still Pending

- Broader quality refactors not completed in this pass:
  - oversized files,
  - long functions,
  - complexity reductions.
- Additional `select("*")` remain in broader `src/**` modules outside the original scoped cleanup.

## P3 Status

### Completed

- `.skip`/`.only` cleanup in tests reached zero.
- Runtime `console.log` usage eliminated (remaining match is a non-runtime example in a comment).
- Env/doc parity improved:
  - `.env.example`
  - `docs/security/pii-retention-coverage.md`
  - `docs/security/integration-compliance-inventory.md`

### Still Pending

- Full env parity closure for all heuristic keys (including test/script-only keys requiring policy decisions).

## Validation Notes

- Focused unit and integration tests were repeatedly executed during remediation, including consolidated regressions.
- Lint checks on touched files returned no new lint errors.
- Some counts in this delta are heuristic and derived from current scans; items marked "not fully re-counted" require a full rerun of the original audit pipeline for exact parity accounting.
