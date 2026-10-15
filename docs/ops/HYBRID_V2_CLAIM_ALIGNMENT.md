# Hybrid v2 claim alignment

**Purpose:** Keep rollout claims aligned with **runtime truth** and **measured metrics**.  
**Last updated:** May 2026 (May 18–19 sprint).  
**Architecture:** `docs/SCORING_ARCHITECTURE.md`.

---

## Current aligned statements (safe to claim)

| Claim                                             | Evidence                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Product scoring is **hybrid v2 only**             | `FitScoreService` → `runHybridFitScorePipeline`; no three-stage product path |
| **Merged extraction+verdict** available           | `FF_MERGED_EXTRACTION_VERDICT=true` → one Sonnet call per score              |
| **Merged model is Sonnet**                        | `FITSCORE_HYBRID_MODEL` default `claude-sonnet-4-6`                          |
| **Prompt caching** active on hybrid system prefix | Single `cache_control: ephemeral` block; ledger stores cache tokens          |
| **Dedupe (4h)** and **concurrent locks** active   | `scoring-guard.ts`, `fit_score_scoring_locks`                                |
| **3-tier resume parse** before scoring            | pdfjs → Haiku → vision (vision flag-gated)                                   |
| **Deterministic fallback** on merged JSON failure | `deterministic-fallback.ts` when flag enabled                                |
| **Cost source tagging** on ledger rows            | `metadata.source` from scoring entrypoints                                   |
| **Primary score 25/75** when blend v2 on          | `blend-v2.ts`; TriBlend in `shadow_score`                                    |
| **Three metrics on cards**                        | FitScore, ICP Match, Market Rank                                             |
| **JD Base 3-screen wizard**                       | ICP → Rubric → Review with mismatch detection                                |
| **Daily scoring metrics**                         | `scoring_daily_metrics` + cron `fitscore-daily-metrics`                      |

---

## Empirical gate snapshot

### May 18–19 sprint (post-hardening)

| Gate                           | Threshold (acceptance doc)      | Observed (May 2026)                                        | Status                     |
| ------------------------------ | ------------------------------- | ---------------------------------------------------------- | -------------------------- |
| Cache hit rate (Sonnet hybrid) | ≥ 85%                           | **~72%** on QA rescoring cohort after merged system prefix | **IMPROVED — not at gate** |
| Merged path enabled            | Staging/prod validation         | **`FF_MERGED_EXTRACTION_VERDICT=true`** shipped            | **PASS**                   |
| Model for merged call          | Sonnet                          | Sonnet 4.6                                                 | **PASS**                   |
| Vision fallback rate           | Minimize spend                  | **`FF_VISION_FALLBACK_ENABLED=false`** recommended in prod | **PASS (policy)**          |
| Ledger cache fields populated  | Non-zero when API returns cache | Yes on successful rows                                     | **PASS**                   |
| Dedupe + lock observability    | Measurable                      | `fitscore_dedupe_skip`, daily metrics                      | **PASS**                   |

### May 3 baseline (historical — pre-sprint)

| Gate                               | Observed     | Status  |
| ---------------------------------- | ------------ | ------- |
| Cache hit rate 24h                 | 0%           | FAIL    |
| 100-candidate batch cost reduction | No run       | NOT MET |
| 50×3 concurrent batch              | High-water 1 | FAIL    |
| Evidence quote substring pass      | 3/20         | FAIL    |
| Confidence distribution sample     | n=25         | PENDING |

Do **not** cite May 3 numbers as current state.

---

## Rollout flags (production)

| Flag                                | May 2026 recommendation                                     |
| ----------------------------------- | ----------------------------------------------------------- |
| `FF_MERGED_EXTRACTION_VERDICT`      | **`true`**                                                  |
| `FF_FITSCORE_BLEND_V2`              | **`true`**                                                  |
| `NEXT_PUBLIC_FF_FITSCORE_BLEND_V2`  | **`true`** (redeploy without build cache for client bundle) |
| `FF_VISION_FALLBACK_ENABLED`        | **`false`** (cost control)                                  |
| `FF_CV_PARSER_HAIKU_ENABLED`        | **`true`** (default)                                        |
| `FF_DETERMINISTIC_FALLBACK_ENABLED` | **`true`** (default)                                        |
| `FF_VERDICT_CV_EVIDENCE`            | **OFF** until quote gate passes                             |
| `FF_CONFIDENCE_BAND`                | **OFF** until distribution gate passes                      |

---

## Important caveats (still true)

- **JD creation blocking** depends on hybrid enablement paths in `JobService` — not every draft job auto-generates JD Base.
- **JD approval reconciliation** discovers candidates from known source tables; not a global scan of all talent.
- **Supersede semantics** apply to hybrid persistence; always filter `superseded_at IS NULL` for “current score.”
- **Organic hybrid %** diagnostics depend on `scoring_status_reason` backfill tagging.
- **72% cache hit** is cohort-specific; re-measure after JD Base churn or model changes.

---

## Investigations

| ID                  | Topic                                       | Status                                                                 |
| ------------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| **Investigation A** | CV parser Sonnet vs Haiku (structured JSON) | **Paused** — see `docs/investigations/2026-05-cv-parser-haiku-eval.md` |
| **Investigation B** | Path mix / three-stage vs hybrid / ledger   | **Closed** — hybrid v2 only; ledger gate cleared 2026-05-09            |

---

## Monitoring after flag changes

- `/admin/fitscore-observability` (if enabled for role)
- `scoring_daily_metrics` day-over-day
- Sentry for scoring/verdict errors
- Ledger: `SUM(amount_usd)` vs Anthropic Console (UTC day, production key)

**Rollback triggers:** cache hit collapse, deterministic fallback spike, recruiter-visible score regressions, ledger vs Console gap > 5%.

---

## Source files

- `src/lib/fitscore/hybrid/pipeline.ts`
- `src/lib/fitscore/hybrid/extraction-and-verdict.ts`
- `src/lib/fitscore/scoring-guard.ts`
- `src/lib/fitscore/resume-parse-chain.ts`
- `src/lib/fitscore/scoring-daily-metrics.ts`
- `src/lib/services/FitScoreService.ts`
- `src/lib/costs/ledger.ts`
- `scripts/validate-fitscore-prompt-cache.ts`

---

## Related docs

- `docs/ops/HYBRID_V2_ACCEPTANCE_GATES_2026-05-03.md` — historical gate run
- `docs/ops/FITSCORE_HARDENING_PRD.md` — §6 sequencing
- `docs/SCORING_HARDENING_STATUS.md` — items #1–4 shipped map
- `docs/briefs/platform-cost-ledger-hardening.md` — ledger acceptance
