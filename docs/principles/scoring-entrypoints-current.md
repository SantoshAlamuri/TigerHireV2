# FitScore entrypoints — current state (canonical)

| Field             | Value                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**        | Living doc — update when ingest or scoring wiring changes                                                                                                                                         |
| **Last verified** | 2026-05-18 (code review on `dev` working tree)                                                                                                                                                    |
| **Supersedes**    | Divergence claims in [`scoring-path-audit.md`](../audits/scoring-path-audit.md) and gap tables in [`scoring-coverage-audit-2026-05.md`](./scoring-coverage-audit-2026-05.md) for TH-SCORING-1/2/3 |

**Point stakeholders and agents here** for “which path scores a candidate?” Older audits remain for historical context only.

---

## Executive summary

- **Production scoring** is **hybrid FitScore v2** only: approved **JD Base** → LLM extraction → deterministic `computeHybridScore` → `fit_scores` with `scoring_version >= 2`.
- **Canonical service:** `FitScoreService.computeSingle` / `computeBatch` in `src/lib/services/FitScoreService.ts` (always calls `runHybridFitScorePipeline` after JD Base gate).
- **Legacy three-stage** (`computeFitScore`, `scorer.ts`, stage1/2/3 pipeline) is **not invoked** from any product ingest path. Remnants: `src/lib/fitscore/three-stage/types.ts`, `parse-llm-json.ts` (shared utilities only).
- **TH-SCORING-1 (WhatsApp), TH-SCORING-2 (email intake), TH-SCORING-3 (dead three-stage branch)** — **done** in code as of 2026-05-18.
- **TH-SCORING-4 (agency bulk follow-up)** — **by design** at ingest (fast save only); scoring runs via Score Pending / reprocess — operational enforcement, not a second scorer.

---

## Canonical entry

```
FitScoreService.computeSingle / computeBatch
  → getJdBaseByJobId
  → if !approved_by: queue pending_jd_approval (default) or throw
  → runHybridFitScorePipeline → saveHybridFitScore (scoring_version 2)
```

WhatsApp wraps the same service via `src/lib/whatsapp/fitscore-routing.ts` (`scoreWhatsAppJobForCandidate`).

---

## Surface inventory (verified 2026-05-18)

| Surface                                 | Entry                                               | Uses canonical service?        | Pipeline  | JD Base gate                    |
| --------------------------------------- | --------------------------------------------------- | ------------------------------ | --------- | ------------------------------- |
| `POST /api/apply`                       | `public-apply.ts` → `processCandidate`              | Yes                            | Hybrid v2 | Yes                             |
| `POST /api/applications`                | route + Inngest `fit-score-single`                  | Yes                            | Hybrid v2 | Yes                             |
| `POST /api/agency/upload-profile`       | `processPublicApplication`                          | Yes                            | Hybrid v2 | Yes                             |
| `POST /api/agency/upload-profile/bulk`  | `savePublicApplication` only at ingest              | **No at ingest** (intentional) | —         | N/A until reprocess             |
| `POST /api/agency/reprocess-candidates` | route                                               | Yes                            | Hybrid v2 | Yes                             |
| `POST /api/agency/rescore-candidates`   | route                                               | Yes                            | Hybrid v2 | Yes                             |
| `POST /api/intake/email`                | enqueue `fit-score-single` or `pending_jd_approval` | Yes (async / dev fallback)     | Hybrid v2 | Yes                             |
| WhatsApp Lane A                         | `lane-a.ts` → `scoreWhatsAppJobForCandidate`        | Yes                            | Hybrid v2 | Yes                             |
| WhatsApp immediate match                | `immediate-match.ts` → routing helper               | Yes                            | Hybrid v2 | Yes                             |
| WhatsApp job alerts                     | `job-alert.ts` → routing helper                     | Yes                            | Hybrid v2 | Yes                             |
| WhatsApp role-guided                    | `role-guided-flow.ts` → routing helper              | Yes                            | Hybrid v2 | Yes                             |
| WhatsApp Scout bulk loop                | `scout.ts` after ingest                             | Yes                            | Hybrid v2 | Yes                             |
| `POST /api/fit-score`                   | route / Inngest batch                               | Yes                            | Hybrid v2 | Yes                             |
| Semantic batch agent                    | `fitscore-agent.ts`                                 | Yes (after vector shortlist)   | Hybrid v2 | Yes                             |
| `POST /api/fitscore/score`              | `runHybridFitScorePipeline` **direct**              | Same pipeline                  | Hybrid v2 | Throws if unapproved (no queue) |
| `POST /api/fitscore/batch`              | `runHybridFitScorePipeline` **direct**              | Same pipeline                  | Hybrid v2 | 428 if unapproved               |
| Recruit job matches UI                  | calls `/api/fitscore/batch`                         | Same pipeline                  | Hybrid v2 | 428 if unapproved               |
| Admin fitscore test                     | `FitScoreService.computeSingle`                     | Yes                            | Hybrid v2 | Yes                             |

**Not a scoring divergence:** `/api/fitscore/score` and `/api/fitscore/batch` skip `FitScoreService` wrapper but run the **same** `runHybridFitScorePipeline`. Difference is queue semantics on unapproved JD (throw/428 vs `pending_jd_approval` queue).

**Application bridge (WhatsApp):** attaches existing `fit_scores.id` — no re-score.

---

## What was fixed (migrations from May 2026 audit)

| Ticket       | Was                                             | Now                                                                                        |
| ------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| TH-SCORING-1 | WhatsApp called `computeFitScore` (three-stage) | All WhatsApp score paths use `fitscore-routing.ts` → `FitScoreService`                     |
| TH-SCORING-2 | Email intake never scored                       | Enqueues `fit-score-single` or `pending_jd_approval` (`src/app/api/intake/email/route.ts`) |
| TH-SCORING-3 | Unreachable `three_stage` branch in service     | Removed — `FitScoreService` is hybrid-only                                                 |
| TH-SCORING-5 | Retire v1 three-stage callers                   | **Done** for product paths; `computeFitScore` no longer in `src/`                          |

---

## Pipeline stage after scoring (2026-05-18)

When hybrid FitScore is saved (`runHybridFitScorePipeline` → `saveHybridFitScore`), the system **auto-advances** `pipeline_candidates` from **Applied** → post-score stage (**FitScore Review** when the job has it, otherwise the next stage by `stage_order`, e.g. Phone screen on legacy QA demo jobs). Skips candidates already past that stage. Does not run plan shortlist approval gates (system move, not a human interview advance). See `src/lib/pipeline/advance-after-fitscore.ts`.

**Backfill existing scored rows:** `npx tsx --env-file=.env.local scripts/advance-scored-applied-pipeline.ts --title "QA Engineer"`

**Still separate:** `applications.status` (e.g. “Applied”) is not changed by this hook — only the pipeline stage shown under Hireability.

---

## Remaining work (not entry-path drift)

| Item                                  | Type        | Notes                                                                                                          |
| ------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| TH-SCORING-4                          | Operational | Bulk ingest stays fast; enforce “Score Pending” / automated sweep so no profile stays unscored                 |
| Accuracy / eval                       | Product     | Golden dataset, HM verdict alignment — see [`scoring-v2-release-control.md`](../scoring-v2-release-control.md) |
| Dimensions ontology v2                | Product     | Rubric sub-signals, shadow promote — separate from path unification                                            |
| Historical `scoring_version = 1` rows | Data        | Superseded rows in DB; active reads use `superseded_at IS NULL`                                                |

---

## Code map (quick grep anchors)

| Concern                        | File                                                       |
| ------------------------------ | ---------------------------------------------------------- |
| Canonical service              | `src/lib/services/FitScoreService.ts`                      |
| Hybrid pipeline                | `src/lib/fitscore/hybrid/pipeline.ts`                      |
| WhatsApp routing               | `src/lib/whatsapp/fitscore-routing.ts`                     |
| Email intake scoring           | `src/app/api/intake/email/route.ts` (~L223–251)            |
| Vector shortlist (recall only) | `src/lib/services/embeddings.ts` → `findSimilarCandidates` |
| Principle (policy)             | [`scoring-coverage.md`](./scoring-coverage.md)             |

---

## Related docs

| Doc                                                                        | Role                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`scoring-coverage.md`](./scoring-coverage.md)                             | Policy: every surface must score or queue                     |
| [`scoring-v2-release-control.md`](../scoring-v2-release-control.md)        | Rollout gates, eval harness                                   |
| [`scoring-path-audit.md`](../audits/scoring-path-audit.md)                 | **Historical** (2026-05-16) — pre-unification                 |
| [`scoring-coverage-audit-2026-05.md`](./scoring-coverage-audit-2026-05.md) | **Historical** gap audit — see “current state” section at top |
