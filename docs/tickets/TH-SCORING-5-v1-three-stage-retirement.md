# TH-SCORING-5: Retire three-stage / v1 scoring paths

| Field      | Value                                   |
| ---------- | --------------------------------------- |
| Status     | **Done** for product paths (2026-05-18) |
| Priority   | Low–Medium                              |
| Depends on | TH-SCORING-1, TH-SCORING-3              |

## Problem

Three-stage (`computeFitScore` → `scoring_version` 1) still callable from code paths and produces scores on a **generic rubric** (`template-generic` / Knowledge Worker), diverging sharply from hybrid v2 JD Base scoring.

Comparison harness (10 QA Engineer applicants): spreads of 31–59 points between hybrid and three-stage on the same resume.

## Outcome (2026-05-18)

1. No `computeFitScore` in `src/` product code; WhatsApp uses `fitscore-routing.ts` → `FitScoreService`.
2. `scorer.ts` and three-stage stage modules removed; `three-stage/types.ts` and `parse-llm-json.ts` remain as shared utilities.
3. Historical `scoring_version = 1` rows may still exist in DB (superseded); active reads use `superseded_at IS NULL`.

Canonical inventory: [`docs/principles/scoring-entrypoints-current.md`](../principles/scoring-entrypoints-current.md).

## Evidence

- `scripts/output/qa-engineer-scoring-comparison-2026-05-16T09-44-54.md`
- `scripts/output/qa-engineer-scoring-comparison-2026-05-16T09-44-54.csv`
- `scripts/compare-scoring-paths-qa-engineer.ts` (regression harness)
- `docs/audits/scoring-path-audit.md`

## Acceptance

- Grep: no `computeFitScore` in `src/lib/whatsapp/` or ingest agents
- `npm run typecheck` + scoring integration tests pass
- Comparison harness on 5 candidates shows only hybrid v2 when re-run after change
