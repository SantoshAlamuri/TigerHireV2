# Codebase Audit Refresh — 2026-04-18

**Baseline:** [audit-2026-04-18.md](./audit-2026-04-18.md). **Delta (same thread):** [audit-2026-04-18-delta.md](./audit-2026-04-18-delta.md).

Fresh mechanical re-audit after remediation waves on P0–P3.

This refresh is intended as a current-state scorecard against the same audit themes. Counts are from direct rescans of the current repository.

## Recalculated Metrics (Current)

| Metric                                                  | Current Count |
| ------------------------------------------------------- | ------------: |
| API route files scanned (`src/app/api/**/route.ts`)     |           261 |
| Mutating routes (`POST/PUT/PATCH/DELETE`)               |           185 |
| Mutating routes with detected Zod parsing/validation    |           146 |
| Mutating routes without detected Zod parsing/validation |            39 |
| `.select("*")` in `src/app/api/**`                      |             0 |
| `.select("*")` in `src/lib/services/**`                 |             0 |
| `.select("*")` in `src/lib/repositories/**`             |             0 |
| `.select("*")` across all `src/**`                      |            57 |
| `.skip/.only` in `tests/**`                             |             0 |
| `console.log` in `src/**`                               |             1 |
| `*.behavior.test.ts` files                              |             5 |
| Export/download routes without `audit` keyword          |             0 |
| Auth routes without `audit` keyword                     |            13 |
| Platform routes without `audit` keyword                 |             3 |
| `process.env.*` keys used in code/scripts               |           125 |
| Keys present in `.env.example`                          |            36 |
| Missing env-example parity keys (heuristic)             |            89 |

## Before vs After (Audit Baseline Comparison)

Comparison against `docs/audit-2026-04-18.md` baseline where directly comparable:

| Area                                                      | Baseline | Current | Delta |
| --------------------------------------------------------- | -------: | ------: | ----- |
| Mutating routes without detected Zod validation           |       65 |      39 | -26   |
| `.select('*')` in API/services/repositories (audit focus) |      123 |       0 | -123  |
| `.skip/.only` annotations                                 |        8 |       0 | -8    |
| `console.log` in `src/**`                                 |        2 |     1\* | -1    |
| Behavior test files                                       |        3 |       5 | +2    |
| Export/download routes without `audit` evidence           |        4 |       0 | -4    |
| Auth routes without `audit` evidence                      |       14 |      13 | -1    |
| Platform routes without `audit` evidence                  |        3 |       3 | 0     |
| Missing `.env.example` parity keys (heuristic)            |      106 |      89 | -17   |

\* Remaining `console.log` is in `src/lib/security/cron-auth.ts` and appears in an example/comment context rather than runtime logging.

## Priority Status Snapshot

## P0

### Closed/Improved

- SECURITY DEFINER hardening and related security migration work completed earlier in this remediation stream.
- Export/download routes now include audit evidence heuristically (`0` missing in current scan).

### Still Pending

- Platform/admin and auth route audit keyword coverage still incomplete (`platform=3`, `auth=13` heuristic).
- Broader tenant-isolation/security architecture findings from the original audit remain non-trivial and require deeper route-by-route review.

## P1

### Closed/Improved

- Mutating request validation coverage improved (`65 -> 39` missing heuristic).
- FK indexing improved with additive migrations:
  - `supabase/migrations/20260418230000_add_missing_fk_indexes_p1.sql`
  - `supabase/migrations/20260418233000_auto_index_unindexed_foreign_keys.sql`
- Behavior coverage expanded with new integration tests:
  - `tests/integration/security-definer-hardening.behavior.test.ts`
  - `tests/integration/rls-explicit-deny-tables.behavior.test.ts`

### Still Pending

- Full closure of all mutating routes lacking detected Zod integration (`39` remaining heuristic).
- Exhaustive behavior coverage for full RLS/security surface (current coverage is representative, not exhaustive).

## P2

### Closed/Improved

- `select("*")` eliminated from the original hot-path scope:
  - `src/app/api/**`
  - `src/lib/services/**`
  - `src/lib/repositories/**`

### Still Pending

- `select("*")` still appears in broader `src/**` (57 occurrences), mostly in non-target modules and docs/examples.
- Long-function/large-file complexity refactors remain outside this mechanical pass.

## P3

### Closed/Improved

- `.skip/.only` cleanup complete (`0`).
- Runtime `console.log` effectively cleaned up (only one example/comment match remains).
- `.env.example` and retention/compliance docs improved.

### Still Pending

- `.env.example` parity not fully closed (`89` missing keys heuristic), including many test/script/platform-specific envs that require policy decisions.

## Notes on Heuristics

- Counts are mechanical and pattern-based; they should be treated as triage signals.
- Some heuristics are intentionally broad (for example env parity and list pagination pattern checks) and may over-report without semantic filtering.
- A route/file being flagged does not always imply a bug; several items require intentional-design review.
