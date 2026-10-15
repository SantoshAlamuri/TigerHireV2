# FitScore scoring hardening — status

**Companion to:** `TigerHire-Scoring-Hardening-PRD.docx` (external) and **`docs/ops/FITSCORE_HARDENING_PRD.md`** (in-repo §6 sequencing).  
**Last updated:** May 2026 (May 18–19 sprint).  
**Architecture:** `docs/SCORING_ARCHITECTURE.md`.

This document maps **hardening initiative items** to **what is shipped in production code today**. Wording is present-tense architecture, not a delta log.

---

## Summary table

| #     | Initiative item                                                 | Status                   | Where it lives                                                                    |
| ----- | --------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| **1** | Prompt caching (measurable cache reads)                         | **Shipped**              | Merged system prefix + `cache_control` in hybrid prompts; ledger `cache_*_tokens` |
| **2** | Single-call merged extraction + verdict                         | **Shipped** (flag-gated) | `FF_MERGED_EXTRACTION_VERDICT`, `extraction-and-verdict.ts`                       |
| **3** | Cost guards: dedupe, locks, parse chain, deterministic fallback | **Shipped**              | `scoring-guard.ts`, `resume-parse-chain.ts`, `deterministic-fallback.ts`          |
| **4** | Primary score blend + three-metric UI                           | **Shipped** (flag-gated) | `blend-v2.ts`, `FitScoreTripleMetrics.tsx`, `shadow_score`                        |

**§6 backlog still open** (from FITSCORE_HARDENING_PRD): evidence-quote quality gates (`FF_VERDICT_CV_EVIDENCE`), confidence bands (`FF_CONFIDENCE_BAND`), batch `p-limit` tuning — see `docs/ops/HYBRID_V2_CLAIM_ALIGNMENT.md`.

---

## Item #1 — Prompt caching

### What it does today

- Hybrid **merged** and **split** paths attach **one ephemeral cache breakpoint** on a **single combined system prefix** (static rubric + instructions), fixing the prior issue where two small blocks were each below minimum cache size.
- Successful Anthropic responses persist **`cache_creation_input_tokens`** and **`cache_read_input_tokens`** on **`platform_cost_events.metadata`**.

### How to verify

- Set `FITSCORE_SCORING_DIAGNOSTIC=true` and score two candidates on the same approved JD Base; second call should show non-zero cache reads in diagnostic JSON.
- Script: `scripts/validate-fitscore-prompt-cache.ts`.
- Daily rollup: `scoring_daily_metrics` Sonnet cache read columns.

### Empirical note (May 2026)

QA rescoring cohort after merge: **~72% cache read rate** on Sonnet hybrid calls (see claim alignment doc). Gate target in acceptance doc was ≥85% — **improved but not at gate threshold**; continue monitoring on production volume.

---

## Item #2 — Merged extraction + verdict (one call per score)

### What it does today

When **`FF_MERGED_EXTRACTION_VERDICT=true`**:

- Pipeline uses **`runMergedExtractionAndVerdict`** — one Sonnet request returns structured candidate extraction + verdict narrative + evidence quotes schema.
- **`MERGED_EXTRACTION_MAX_ATTEMPTS=1`** — no multi-attempt retry storms.

When flag is **false**, legacy split path: separate extraction and explanation calls (higher cost).

### Model

**Sonnet** (`FITSCORE_HYBRID_MODEL`, default `claude-sonnet-4-6`). Not Haiku for this step (May 2026).

### Operational default

Enable on staging and production after JD Base approval flow is stable:

```bash
FF_MERGED_EXTRACTION_VERDICT=true
```

---

## Item #3 — Cost guards and parse chain

### Shipped controls

| Control                    | Behavior                                                                 |
| -------------------------- | ------------------------------------------------------------------------ |
| **4h dedupe**              | Skip API if recent `fit_scores` row exists; `force: true` bypasses       |
| **Concurrent lock**        | `fit_score_scoring_locks` + RPCs                                         |
| **3-tier parse**           | pdfjs/DOCX/text → Haiku → vision (vision flag-gated)                     |
| **Deterministic fallback** | Regex/signal score if merged JSON fails                                  |
| **Source tagging**         | `upload` / `api` / `rescore` / `script` / `investigation` on cost events |
| **Daily metrics cron**     | `scoring_daily_metrics` + `/api/cron/fitscore-daily-metrics`             |

### Docs

`docs/FITSCORE_COST_CONTROLS_BRIEF.md`

---

## Item #4 — Blend v2 and three-score display

### What it does today

- **Primary `overall_score`:** `0.25 × skills_signal + 0.75 × intent_match` when `FF_FITSCORE_BLEND_V2=true`.
- **`shadow_score`:** preserves legacy **TriBlend** (40/30/30-style composite) for comparison — not shown as the headline metric.
- **UI:** FitScore, ICP Match %, Market Rank % on cards (`NEXT_PUBLIC_FF_FITSCORE_BLEND_V2` for client gating).

### Persistence

`fit_scores.overall_score`, `v2_score_breakdown` (blend metadata, ICP/market fields), `shadow_score` column.

---

## Investigation A — CV parser Sonnet vs Haiku

**Charter:** `docs/investigations/2026-05-cv-parser-haiku-eval.md`  
**Status:** **Paused** (`TH-CV-PARSER-MODEL-EVAL` in `docs/ops/parked-work.md`).

**Context:** Tier-2 parse chain uses Haiku for **text enrichment** when pdfjs output is short. Structured **profile** CV parser in agents may still use Sonnet on separate paths — do not conflate with merged scoring call.

**Result to date:** Protocol documented; full 15-resume empirical pass not completed. No production switch of merged scoring to Haiku.

---

## Investigation B — Path mix / ledger / three-stage history

**Charter:** Cost memos + `docs/briefs/platform-cost-ledger-hardening.md`  
**Status:** **Closed for operational decisions.**

**Findings (still true):**

- Active product scoring is **100% hybrid v2** (`scoring_version >= 2`).
- Historical **three-stage** rows may exist but are **superseded** — always filter `superseded_at IS NULL` for current-state analysis.
- Ledger acceptance cleared **2026-05-09**; per-profile baseline **~$0.07–0.10 USD** documented in parked-work.

**May 2026 additions:** source on cost rows, cache fields populated, dedupe events in observability stream.

---

## What is explicitly not in this sprint

| Item                                     | Tracker                                  |
| ---------------------------------------- | ---------------------------------------- |
| Verdict page redesign                    | `TH-VERDICT-PAGE-REDESIGN`               |
| Explanation bullet dedup                 | `TH-VERDICT-DEDUP`                       |
| `FF_VERDICT_CV_EVIDENCE` production flip | Gates failing/pending in claim alignment |
| `FF_CONFIDENCE_BAND` production flip     | Same                                     |
| WhatsApp progressive ICP                 | Deferred product sprint                  |

---

## References

- `docs/ops/FITSCORE_HARDENING_PRD.md`
- `docs/ops/HYBRID_V2_CLAIM_ALIGNMENT.md`
- `docs/ops/HYBRID_V2_ACCEPTANCE_GATES_2026-05-03.md` (historical gate run)
- `docs/ops/parked-work.md`
