# TH-SCORING-4: Agency bulk upload — Score Pending enforcement

| Field      | Value                            |
| ---------- | -------------------------------- |
| Status     | **Parked** — product call needed |
| Priority   | Medium                           |
| Depends on | — (TH-SCORING-1 done)            |

## Problem

`POST /api/agency/upload-profile/bulk` persists applications only. FitScore runs only when operators invoke **Score Pending** (`reprocess-candidates`). Bulk path is intentionally deferred but easy to forget in ops. **Not a second scoring engine** — follow-up must use the same `FitScoreService` path.

See [`docs/principles/scoring-entrypoints-current.md`](../principles/scoring-entrypoints-current.md).

## Options (product)

1. **Auto-score** approved-JD jobs on bulk ingest (parity with single upload)
2. **Hard gate** — block bulk completion until Score Pending run or show blocking banner
3. **Keep manual** — document + dashboard reminder only

## Evidence

- `docs/audits/scoring-path-audit.md`
- `scripts/output/qa-engineer-scoring-comparison-2026-05-16T09-44-54.csv`

## Acceptance

- Chosen product option implemented with test coverage on bulk upload route
