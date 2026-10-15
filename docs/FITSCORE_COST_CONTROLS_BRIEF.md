# FitScore cost controls

**Audience:** Engineering and ops.  
**Last updated:** May 2026.  
**Architecture context:** `docs/SCORING_ARCHITECTURE.md`.

This brief explains **how TigerHire limits duplicate spend and model cost** on the hybrid scoring path. It is not a changelog.

---

## 1. Design goals

1. **Never pay twice** for the same `(job, candidate)` score within a short window unless explicitly forced.
2. **Never run two scorers** for the same pair concurrently (race → duplicate rows and duplicate API cost).
3. **Prefer free/cheap text extraction** before Sonnet vision.
4. **One Sonnet call per score** when merged extraction+verdict is enabled, with **prompt cache** reuse across candidates on the same JD Base.
5. **Degrade gracefully** to deterministic scoring when LLM JSON fails — avoid unbounded retries.
6. **Measure everything** in `platform_cost_events` and `scoring_daily_metrics`.

---

## 2. Request-level guards

### 2.1 Four-hour dedupe

**Where:** `FitScoreService.computeSingle` → `findRecentFitScoreForDedupe` (`scoring-guard.ts`).

**Rule:** If a production score (`is_test_run = false`, `superseded_at IS NULL`, `scoring_status = scored`) exists for the pair and `created_at` is within **`FITSCORE_DEDUPE_WINDOW_MS` (4 hours)**, return that row and skip all model calls.

**Bypass:** Pass **`force: true`** (rescoring, calibration scripts, admin tools).

**Telemetry:** Structured log `fitscore_dedupe_skip` + `recordFitScoreObservabilityEvent` with `metadata.source`.

### 2.2 Concurrent scoring lock

**Where:** Postgres table **`fit_score_scoring_locks`** + RPCs `try_acquire_fit_score_scoring_lock` / `release_fit_score_scoring_lock`.

**Rule:** Only one active scorer per `(job_id, candidate_id)`. A second worker receives **`concurrent_skip`** (no API spend).

**Stale recovery:** Locks older than **`FITSCORE_SCORING_LOCK_STALE_MS` (2 min)** can be taken over so stuck workers do not block forever.

**Migration:** `supabase/migrations/20260518180000_fit_score_scoring_locks.sql`.

---

## 3. Resume parse chain (pre-scoring)

Implemented in **`runResumeParseChain`** (`resume-parse-chain.ts`).

| Tier | Trigger                                                                             | Cost profile                        |
| ---- | ----------------------------------------------------------------------------------- | ----------------------------------- |
| 1    | `pdfjs` / DOCX / raw text length ≥ **`RESUME_PARSE_MIN_CHARS`** (default **2000**)  | **$0**                              |
| 2    | Below threshold; `FF_CV_PARSER_HAIKU_ENABLED` not `false`                           | **Haiku** — cheap text cleanup      |
| 3    | Still below threshold; PDF buffer present; `FF_VISION_FALLBACK_ENABLED` not `false` | **Sonnet multimodal** — last resort |

**Recommended production:**

```bash
RESUME_PARSE_MIN_CHARS=2000
FF_CV_PARSER_HAIKU_ENABLED=true
FF_VISION_FALLBACK_ENABLED=false   # disable expensive tier unless debugging
```

Tier 3 is **skipped entirely** when vision flag is false — scoring continues with whatever text tiers 1–2 produced (may reduce confidence but avoids ~$0.02–0.04 per vision call).

---

## 4. Hybrid call minimization

### 4.1 Merged extraction + verdict

**Flag:** `FF_MERGED_EXTRACTION_VERDICT=true`

**Effect:** Single Sonnet Messages API call returns structured extraction and recruiter-facing verdict fields (`extraction-and-verdict.ts`).

**Retries:** `MERGED_EXTRACTION_MAX_ATTEMPTS=1` — at most one repair attempt; no exponential retry loops.

### 4.2 Prompt caching

All static hybrid instructions are concatenated into **one system block** with a single **`cache_control: ephemeral`** breakpoint so Anthropic can serve **cache reads** on subsequent scores sharing the same JD Base prefix.

Cache token counts are stored on ledger rows. Target operational check: **cache read rate** trending toward 70%+ on steady-state job batches (see claim alignment doc).

### 4.3 Model choice

**Default extraction/verdict model:** Sonnet via `FITSCORE_HYBRID_MODEL` (default `claude-sonnet-4-6`).

Haiku remains in the **parse chain tier 2** only, not as the merged scoring model (May 2026 sprint decision).

---

## 5. Deterministic fallback

**Flag:** `FF_DETERMINISTIC_FALLBACK_ENABLED` (default **on** unless set to `false`).

When merged Sonnet output fails schema/JSON validation after the single allowed attempt:

1. Pipeline logs **`fitscore_deterministic_fallback`**.
2. **`buildDeterministicFallbackScore`** computes scores from rubric signals and regex-style evidence — **no extra LLM call**.
3. Row still persists with `scoring_status = scored` where possible so recruiters are not blocked.

Use diagnostics (`FITSCORE_SCORING_DIAGNOSTIC=true`) to track fallback rate; alert if it spikes (bad prompts, model outages, or PDF quality collapse).

---

## 6. Source attribution (cost ledger)

Every scoring invocation should pass **`source`** into `FitScoreService` options. That value flows to:

- `platform_cost_events.metadata.source`
- Dedupe/lock skip events

This enables per-entrypoint cost attribution (`upload` vs `rescore` vs `api`) in admin SQL and daily metrics.

**Choke point:** `recordAnthropicCostEvent` in `ledger.ts`, called from `anthropic.ts` after successful (and many failed) API responses.

---

## 7. Daily metrics and alerts

**Cron:** `/api/cron/fitscore-daily-metrics` (daily 00:30 UTC).

**Table:** `scoring_daily_metrics`

Aggregates include: total scores, dedupe skips, concurrent skips, parse tier counts, Sonnet input/output tokens, **cache read tokens**, deterministic fallback count, estimated USD.

Use this table for:

- Week-over-week cost regression
- Cache effectiveness after JD Base changes
- Vision tier accidentally re-enabled

---

## 8. Operator playbook

| Goal                        | Action                                                                       |
| --------------------------- | ---------------------------------------------------------------------------- |
| Rescore everyone on a job   | Use routes/scripts with **`force: true`**                                    |
| Cut vision spend            | `FF_VISION_FALLBACK_ENABLED=false`, keep `RESUME_PARSE_MIN_CHARS=2000`       |
| Debug one profile           | `FITSCORE_SCORING_DIAGNOSTIC=true`, inspect `v2_score_breakdown.signals_log` |
| Validate cache              | `npx tsx scripts/validate-fitscore-prompt-cache.ts` (see script header)      |
| Compare ledger to Anthropic | Follow **`docs/briefs/platform-cost-ledger-hardening.md`** acceptance tests  |

---

## 9. Related documents

- `docs/SCORING_ARCHITECTURE.md` — full pipeline
- `docs/briefs/platform-cost-ledger-hardening.md` — ledger accuracy gate
- `docs/SCORING_HARDENING_STATUS.md` — PRD item status
- `docs/ops/HYBRID_V2_CLAIM_ALIGNMENT.md` — empirical gate results

---

## 10. Sprint outcomes (May 18–19)

Measured results, quality iterations on 8 recruiter-graded candidates, root causes, and branch map:

**→ [`docs/SPRINT_SUMMARY_MAY_18_19.md`](SPRINT_SUMMARY_MAY_18_19.md)**
