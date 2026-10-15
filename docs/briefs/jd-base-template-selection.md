# Brief #5 — Role-specific scoring via template selection

## Problem

Pilot customers expect backend-specific dimensions for "Backend Engineer" jobs, not generic LLM rubrics.

## Codebase reality

Role-specific dimensions flow through **approved JD Base** → hybrid extraction. Template matching runs at **job create** via `findBestIndiaTemplate` / `selectRubric`, not inside the per-score extraction call.

## Solution

1. `selectRubric(jdBlob)` wrapper in `src/lib/fitscore/hybrid/select-rubric.ts` with `recordRubricSelectedMetric`
2. Title-line bonus in `findBestIndiaTemplate` for exact job title matches
3. `ensureJdBaseForJob` and `POST /api/fitscore/jd-base` use `selectRubric`
4. Demo job: approve JD Base before batch scoring (`npm run seed:pilot-demo`)

## Out of scope

BRD Phase 1 sub-signals, `scoring_config` table, three-stage revival.

## Acceptance

Demo job "Backend Engineer" shows template-derived weights in JD Base UI and `v2_score_breakdown`.

## Tests

`tests/unit/select-rubric.test.ts`
