# V3 Cascade — Phase 1 caller trace

**Purpose:** Map every FitScore write path to whether it can produce `scoring_method IS NULL`, and confirm post–Phase-1 behavior when `ff_path_unification` is ON.

**Prod snapshot (30d, project `htdyomyhkvhcwoeodwas`):**

| scoring_method         | scoring_version |   count |
| ---------------------- | --------------- | ------: |
| hybrid_merged          | 2               |     181 |
| **NULL**               | **2**           | **120** |
| NULL                   | 1               |      14 |
| deterministic_fallback | 2               |       3 |

**Interpretation (corrected):** There was **no active rogue-caller bug**. The dominant null bucket is **hybrid v2 (`scoring_version = 2`)** — **120/120** have both `v2_extraction` and `v2_explanation` (verified on prod). Those rows were saved before `scoring_method` was always populated — a **backfill artifact**, not mis-routing. Only **14** rows are genuine three-stage (`scoring_version = 1`). The earlier “42% on a broken legacy path” story was **mostly wrong**; real cost drivers are retry storms and Sonnet extraction volume, not a silent split-path majority.

**Backfill:** migration `20260604140000_backfill_scoring_method_hybrid_merged.sql` sets `scoring_method = 'hybrid_merged'` for those 120 rows after deploy.

**Phase 1 cost expectation:** Path unification is **hygiene** (always set `scoring_method`, block legacy branches). Do **not** expect Step 1 alone to move ₹/profile much. **Step 2 (Haiku)** is where cost upside lives.

---

## Production entry points (approved JD → hybrid pipeline)

All of these route through `FitScoreService.computeSingle` / `computeBatch` → `runHybridFitScorePipeline` → `saveHybridFitScore` when `jd_base_documents.approved_by` is set.

| #   | Entry point                | File                                             | `scoringSource` / notes             | After `ff_path_unification`       |
| --- | -------------------------- | ------------------------------------------------ | ----------------------------------- | --------------------------------- |
| 1   | POST `/api/fit-score`      | `src/app/api/fit-score/route.ts`                 | `api` / batch enqueue               | Merged path; `scoring_method` set |
| 2   | POST `/api/fitscore/score` | `src/app/api/fitscore/score/route.ts`            | default                             | Merged path; `scoring_method` set |
| 3   | POST `/api/fitscore/batch` | `src/app/api/fitscore/batch/route.ts`            | default                             | Merged path; `scoring_method` set |
| 4   | Inngest `fit-score-single` | `src/inngest/functions.ts`                       | `upload`                            | Merged path; `scoring_method` set |
| 5   | Inngest `fit-score-batch`  | `src/inngest/functions.ts`                       | batch                               | Merged path; `scoring_method` set |
| 6   | POST `/api/applications`   | `src/app/api/applications/route.ts`              | fallback admin client               | Merged path when JD approved      |
| 7   | Email intake               | `src/app/api/intake/email/route.ts`              | fire-and-forget                     | Merged path when JD approved      |
| 8   | Idibu webhook              | `src/lib/integrations/idibu/process-webhook.ts`  | enqueue single                      | Merged path when JD approved      |
| 9   | WhatsApp routing           | `src/lib/whatsapp/fitscore-routing.ts`           | explicit hybrid; **no three-stage** | Merged path when JD approved      |
| 10  | Agency rescore             | `src/app/api/agency/rescore-candidates/route.ts` | rescore                             | Merged path when JD approved      |

**Additional callers (same pipeline):** `public-apply.ts`, `scout.ts`, `fitscore-agent.ts`, `agency/reprocess-candidate.ts`, tryout `score-cv.ts`, admin `fitscore-test`, scripts (`rescore-*`, `calibrate-*`, `score-candidate.ts`).

**Before/after for null rows from these callers:**

| State          | `FF_MERGED_EXTRACTION_VERDICT` OFF, `ff_path_unification` OFF      | `ff_path_unification` ON                        |
| -------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| Merged env ON  | `hybrid_merged`                                                    | `hybrid_merged`                                 |
| Merged env OFF | `hybrid` (split) or fallback; **older rows omitted column → NULL** | **`hybrid_merged` only** (legacy branch throws) |

---

## Paths that do **not** go through `saveHybridFitScore` (can still create odd rows)

| Path                    | File                                                                             | `scoring_method`          | Risk when flags ON                               |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------ |
| Prescreen gate failure  | `src/lib/prescreen/save-gated.ts`                                                | `prescreen_gate`          | By design; no LLM                                |
| Deferred / pending JD   | `FitScoreService.markDeferredScore`                                              | omitted (status only)     | No score compute                                 |
| Screening agent         | `src/lib/agents/screening.ts`                                                    | legacy insert shape       | **Out of cascade scope** — separate product path |
| Seed / pilot scripts    | `scripts/pilot-seed-lifecycle-data.ts`, `scripts/seed-qa-engineer-candidates.ts` | manual / omitted          | Dev only                                         |
| Direct pipeline script  | `scripts/regen-sm-jdbase.ts`                                                     | via `saveHybridFitScore`  | OK if pipeline used                              |
| Tryout explanation-only | `src/lib/tryout/explanation.ts`                                                  | uses `saveHybridFitScore` | Should pass `scoring_method` if extended         |

**Not a null source for v2 hybrid today:** `runHybridFitScorePipeline` legacy branch sets `scoring_method = 'hybrid'`. The **120 null v2 rows** are historical column omission, not active split-path writes.

---

## Code guard (legacy unreachable when flag ON)

`resolveUseMergedExtractionPath()` returns true when `ff_path_unification` is enabled for the org.

`pipeline.ts` additionally **throws** if execution reaches:

- `runHybridExtraction` + `runHybridExplanation` / `runVerdictExplanation` branches while `pathUnification === true`.

Grep verification (runtime callers of split path):

- `runHybridExtraction` — `pipeline.ts` (guarded), unit tests, tryout explanation (tryout only).
- `runHybridExplanation` — `pipeline.ts` (guarded), tryout explanation, unit tests.

No API route calls split extraction directly.

---

## Acceptance queries (per org / window)

```sql
-- 1) No new null scoring_method on scored rows
SELECT scoring_method, count(*)
FROM fit_scores
WHERE created_at > now() - interval '7 days'
  AND scoring_status = 'scored'
  AND organisation_id = :pilot_org_id  -- join via jobs if needed
GROUP BY scoring_method;

-- 2) Retry storm check (should be 0 in soak window after unification)
SELECT count(*)
FROM platform_cost_events
WHERE created_at > :soak_start
  AND metadata->>'label' IN (
    'fitscore-hybrid-extraction',
    'fitscore-hybrid-explanation',
    'fitscore_extraction_validation_failed'
  )
  AND job_id = :pilot_job_id
  AND candidate_id = :pilot_candidate_id
HAVING count(*) > 3;  -- expect no rows; merged path = 1 extraction call
```

---

## Database

TigerHire project: **`htdyomyhkvhcwoeodwas`**. Apply migrations via PR; soak on dev preview. Flags remain OFF until pre-flight steps pass.
