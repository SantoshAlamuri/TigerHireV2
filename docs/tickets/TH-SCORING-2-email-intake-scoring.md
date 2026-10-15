# TH-SCORING-2: Email intake scoring

| Field      | Value                                      |
| ---------- | ------------------------------------------ |
| Status     | **Done** (2026-05-17; verified 2026-05-18) |
| Priority   | Medium                                     |
| Depends on | TH-SCORING-1 (WhatsApp canonical path)     |

## Problem

**Fixed 2026-05-17:** `POST /api/intake/email` now enqueues `fit-score-single` when JD base is approved, or `pending_jd_approval` when not (with Inngest-off fallback via `FitScoreService.computeSingle`).

See [`docs/principles/scoring-entrypoints-current.md`](../principles/scoring-entrypoints-current.md).

## Proposed fix

After CV parse + application save, mirror public-apply / WhatsApp Message path:

- JD Base approved → `FitScoreService.computeSingle`
- Not approved → enqueue `pending_jd_approval` (email acknowledgement via Resend if product wants parity)

## Evidence

- `scripts/output/qa-engineer-scoring-comparison-2026-05-16T09-44-54.md` — hybrid vs three-stage divergence on QA Engineer cohort
- `docs/audits/scoring-path-audit.md`

## Acceptance

- Email intake triggers scoring or pending queue without manual reprocess
- Integration test on intake route
