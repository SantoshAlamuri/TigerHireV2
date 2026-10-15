# Three-Stage Fit Score — Verification Checklist

This doc records what was verified in the codebase against the implementation spec.

---

## ✅ Verified in Codebase

### 1. Model versions (exact)

- **Stage 1** `src/lib/fitscore/three-stage/stage1-role-intel.ts`: `MODEL_VERSION = "claude-sonnet-4-20250514"` ✓
- **Stage 2** `src/lib/fitscore/three-stage/stage2-candidate-intel.ts`: `MODEL_VERSION = "claude-haiku-4-5-20251001"` ✓

### 2. Temperature = 0

- Both Stage 1 and Stage 2 Anthropic calls use `temperature: 0` ✓

### 3. Snake_case convention

- Types and Stage 3 use: `evidence_rules`, `criterion_id`, `job_id`, `profile_completeness`, `jd_text_hash`, `resume_text_hash`, etc. ✓
- DB columns: `criteria_breakdown`, `key_strengths`, `key_gaps`, `rubric_snapshot`, `evidence_snapshot` ✓

### 4. Band thresholds (exact)

- `src/lib/fitscore/three-stage/stage3-match.ts`:
  - `score >= 78` → Strong Fit
  - `score >= 62` → Good Fit
  - `score >= 45` → Moderate Fit
  - `score >= 25` → Weak Fit
  - else → Not a Fit ✓

### 5. Deterministic guarantee (Stage 3)

- **No LLM** in Stage 3 ✓
- **No `Math.random()`** in `stage3-match.ts` ✓
- **No `Date` in the score calculation**: score, band, criteria_breakdown, key_strengths, key_gaps are pure functions of rubric + candidate + hashes. Only `provenance.scored_at` is set to `new Date().toISOString()` for **audit metadata** — it is not an input to the score. ✓

### 6. Snapshot storage

- `fit_scores` migration has `rubric_snapshot jsonb` and `evidence_snapshot jsonb` ✓
- `scorer.ts` passes full objects: `rubric_snapshot: rubric`, `evidence_snapshot: candidate` ✓
- `supabase-adapter.ts` writes them to the `fit_scores` upsert ✓

### 7. buildScoreInput and profile_completeness

- `src/lib/fitscore/score-input-helpers.ts`: `buildScoreInput()` builds `ScoreInput` with `profile_completeness` ✓
- `deriveProfileCompleteness()` heuristic: name, skills, experience_years, resume length, parse_quality ✓

### 8. RLS

- `fit_score_rubrics`: Org members can SELECT for their jobs; super_admin can read all. No INSERT/UPDATE for anon/authenticated (service role only). ✓
- `fit_score_evidence`: Same pattern. ✓

### 9. Kept files

- `resume-validation.ts` ✓
- `vision-fallback.ts` ✓

### 10. FitScoreCard and mappers

- **FitScoreCard** shows: `score.band ?? score.rating`, `score.confidence`, `score.criteriaBreakdown` (criteria breakdown), `score.keyStrengths`, `score.keyGaps` ✓
- **Mapper** `mapDbFitScoreToView`: maps `criteria_breakdown`, `key_strengths`, `key_gaps`, `band` from DB (snake_case) to view model ✓

---

## Tests

- **Stage 3 determinism** (unit): `tests/unit/fitscore-three-stage.test.ts` — same inputs → same score and same provenance hash ✓
- **Service + routes**: `fitscore-service.test.ts`, `fitscore-routes.test.ts`, `fitscore-cache.test.ts`, `src/lib/fitscore/scorer.test.ts` (wrapper + buildScoreInput mock) ✓

There is **no** dedicated benchmark suite with 12 candidates in the repo; the “15 tests” refer to the combined unit tests across the fit-score service, routes, cache, three-stage Stage 3, and scorer wrapper.

---

## Quick determinism check (Stage 3 only)

Stage 3 determinism is covered by:

```bash
npm run test -- tests/unit/fitscore-three-stage.test.ts
```

The test “same inputs produce same score (determinism)” calls `computeScore` twice with the same rubric, candidate, and hashes and asserts `r1.score === r2.score` and same `provenance_hash`.

---

## Full-pipeline determinism (E2E)

To verify that the **full pipeline** (Stage 1 → 2 → 3) yields the same score when run 3 times for the same job + candidate:

1. Use an authenticated request to `POST /api/fit-score` with `{ jobId, candidateIds: [candidateId] }` three times.
2. Compare the three `overallScore` (or `score`) values — they should be identical.

The script `scripts/verify-fit-score-determinism.mjs` is a starting point; it must run against a running app with valid auth (e.g. session cookie or service role calling an internal API). Without auth, use the Stage 3 unit test above.

---

## Summary

| Item                                      | Status                          |
| ----------------------------------------- | ------------------------------- |
| Model versions                            | ✓                               |
| Temperature 0                             | ✓                               |
| Snake_case                                | ✓                               |
| Band thresholds                           | ✓                               |
| Stage 3 deterministic                     | ✓ (no LLM/random/Date in score) |
| Snapshot storage                          | ✓                               |
| buildScoreInput + completeness            | ✓                               |
| RLS                                       | ✓                               |
| resume-validation / vision-fallback kept  | ✓                               |
| FitScoreCard criteria/band/strengths/gaps | ✓                               |
| Benchmark 12-candidate suite              | ❌ Not present                  |
