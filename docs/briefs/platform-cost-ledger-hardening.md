# Platform cost ledger hardening (prerequisite to Hardening PRD §6)

**Status:** **Accepted (2026-05-09)** — baseline trustworthy; **May 18–19 sprint** added source tagging, dedupe observability, and reliable cache token persistence on hybrid Sonnet paths.  
**Related:** FitScore cost investigation (ledger vs Anthropic); Hardening PRD §6 non-cost items may proceed; see `docs/SCORING_HARDENING_STATUS.md`.

## Problem statement

`platform_cost_events` is not trustworthy for unit economics today:

- Ledger captured ~**$0.02** vs Anthropic actual ~**$1.60** on a known QA window (~**98%** under-recorded).
- **Sonnet** (PDF vision / `vision-fallback-resume`) does not appear in the ledger for that window despite `fitscore_extraction_log` showing Sonnet on **8/10** QA profiles.
- **`job_id`** / **`candidate_id`** are often empty on events, blocking per-job rollups.
- Broken rows show **`amount_usd = 0`** and missing **`metadata`** (e.g. model/label/tokens).
- **`cache_creation_input_tokens`** / **`cache_read_input_tokens`** were **0** everywhere in stored metadata despite `cache_control` being sent on some paths — either no reuse, or metrics not persisted.

**Conclusion (historical):** Ledger was not trustworthy for unit economics until acceptance (2026-05-09).

**Current state (May 2026):** Cache tokens are persisted on successful Anthropic rows; merged hybrid system prefix yields measurable cache reads (~72% on QA cohort — see `docs/ops/HYBRID_V2_CLAIM_ALIGNMENT.md`). **`metadata.source`** tags scoring entrypoints (`upload`, `api`, `rescore`, `script`, `investigation`). Dedupe skips emit observability events (`fitscore_dedupe_skip`) rolled into `scoring_daily_metrics`.

---

## Objective

Make Anthropic inference rows in `platform_cost_events` **complete, attributable, and reconcilable** to Anthropic Console usage for the **production API key**, using **UTC day boundaries**.

---

## Scope — implementation

### 1. Vision / Sonnet path

- Ensure every successful Anthropic Messages API call used for FitScore (including **`vision-fallback-resume`**) results in a ledger row with correct **`metadata.model`** (production Sonnet checkpoint string) and token usage.

### 2. Choke point (explicit)

**Primary choke point:** `recordAnthropicCostEvent` in `src/lib/costs/ledger.ts`, invoked from **`callClaude`** and **`callClaudeWithUserContent`** in `src/lib/services/anthropic.ts` after successful responses.

**Deliverable:**

- All **FitScore-relevant** Anthropic traffic (vision fallback, hybrid extraction, hybrid explanation / verdict explanation, and any other step on the scoring path) must either:
  - go through **`callClaude` / `callClaudeWithUserContent`** so **`recordAnthropicCostEvent` runs**, or
  - call **`recordAnthropicCostEvent`** from a single audited wrapper with the same contract.

**Audit checklist (non-exhaustive — run before merge):**

```bash
# Direct SDK bypasses (must be reviewed / eliminated on scoring paths)
rg 'anthropic\.messages\.create|Messages\.create' src/
```

Known direct usage today includes e.g. `src/lib/fitscore/three-stage/stage2-candidate-intel.ts` — ensure **hybrid v2 path** does not rely on unlogged call sites. FitScore investigation confirmed **`vision-fallback.ts`** already uses `callClaudeWithUserContent`; root-cause why Sonnet rows still missing (upsert failure, attribution, etc.) rather than “wrong entrypoint” alone.

### 3. `job_id` / `candidate_id` on every inference row

- Thread attribution from `FitScoreService.computeSingle` / `runHybridFitScorePipeline` into **all** nested Claude calls (vision + hybrid extraction + explanation).
- Allow null only for calls that are provably unattributable (list exceptions in PR).

### 4. `amount_usd` on failures

- On Anthropic errors: if the API returns **usage**, record estimated **`amount_usd`** from that usage.
- If no usage: record **`0`** with **`metadata.status = 'error'`** (or equivalent) and a stable **error class** string — never silent omission that looks like a “free” call.

### 5. Prompt cache fields in `metadata`

- On **every successful** row, persist **`cache_creation_input_tokens`** and **`cache_read_input_tokens`** from the Messages API response into **`metadata`**, alongside **`input_tokens`** / **`output_tokens`**.

### 6. Upsert reliability

- Root-cause **`Failed to upsert platform_cost_events`** (logs often stringify Supabase errors as `[object Object]` — fix logging to **`JSON.stringify`** or structured fields so failures are debuggable).
- Ensure **`external_id`** is always a stable, unique string per logical API invocation (no collision on retries unless intentionally idempotent).

---

## Acceptance tests

### A — Ledger vs Anthropic (tight comparison spec)

- **Compare:** `SUM(platform_cost_events.amount_usd)` for `provider = 'anthropic'` over a **single UTC calendar day**.
- **Against:** **Anthropic Console → Usage → filter by the production API key → same UTC calendar day** (00:00–24:00 UTC). Do **not** use invoice totals or blended workspace keys unless this project uses a single key for all Console usage.
- **Target:** Ledger within **1%** of Console usage total for that key + UTC day.

### B — Sonnet vs extraction log (reconciliation)

- For the **same time window** and **same job/cohort** (e.g. QA batch):
  - Count **Sonnet** rows in `platform_cost_events` (filter by `metadata.model` matching production Sonnet checkpoint, and label `vision-fallback-resume` or agreed equivalent).
  - Count Sonnet success rows in **`fitscore_extraction_log`** (`extraction_model = 'sonnet'` and `event_type = 'extraction_success'`, or the agreed definition of “Sonnet ran”).
- **Target:** Sonnet **ledger row count** within **±1** of that **log count** for the window (not merely “≥1 Sonnet row exists”).

### C — Attribution coverage

- For ≥ **95%** of Anthropic rows in the window that are attributable to FitScore (by label or service): **`job_id`** and **`candidate_id`** are **non-null**.

### D — Cache metrics present when API returns them

- Spot-check: for successful calls where Anthropic returns non-zero cache tokens, **`metadata.cache_read_input_tokens`** and/or **`metadata.cache_creation_input_tokens`** are **non-zero** in `platform_cost_events`.

### E — No malformed identifiers / regression guard

- **Zero** rows in the **7 days following deploy** where:
  - `external_id` equals **`[object Object]`** or other malformed patterns, or
  - `external_id` / metadata suggest stringified object bugs.
- Add a lightweight CI or cron query to alert if this pattern appears.

---

## Measurement protocol (after acceptance)

1. **Single hybrid pass only:** Re-run **10 QA pipeline profiles** with **one** intentional scoring pass (no A/B double-rescore for this measurement).
2. **Expected ledger shape:**
   - **Sonnet** rows for every PDF (or profile) that hits vision fallback (per `fitscore_extraction_log` reconciliation per **test B**).
   - **Haiku** rows for hybrid extraction + explanation (labels as implemented).
   - **Ledger sum** for that key + UTC window within **1%** of Anthropic Console Usage (**test A**).
3. **Gate:** If ledger vs Console gap **> 5%**, treat ledger fix as **incomplete** — **do not proceed** to Hardening PRD §6 until resolved.
4. Publish **per-pass USD** and **model split** from the ledger in a short memo; use that as the **baseline** for §6 sequencing.

---

## Investigation B closure (context)

For the QA job used in the cost memo: **three-stage (`scoring_version = 1`) rows in the 7-day window were entirely superseded**; **active path is 100% hybrid v2** (`scoring_version >= 2`). Naive row counts mixed historical three-stage inserts with current hybrid traffic — **do not** attribute overrun to three-stage for **current** scoring without checking **`superseded_at`**.

---

## Follow-on (separate brief — queue after ledger acceptance)

**PDF / vision fallback rate (~80% on QA batch)** is a **product and cost** issue, not fixed by ledger work. Ledger hardening only makes that cost **measurable**.

After acceptance tests pass, open a separate investigation brief:

- Why fallback triggers so often (scanned PDFs vs parser calibration vs threshold logic).
- Options: cheaper extraction path, batch OCR, stricter “text good enough” gate, etc.

---

## References (code)

- `recordAnthropicCostEvent` — `src/lib/costs/ledger.ts`
- `callClaude`, `callClaudeWithUserContent` — `src/lib/services/anthropic.ts`
- Vision fallback — `src/lib/fitscore/vision-fallback.ts` (tier 3; disable via `FF_VISION_FALLBACK_ENABLED=false`)
- Parse chain — `src/lib/fitscore/resume-parse-chain.ts`
- Scoring source — `src/lib/fitscore/scoring-source.ts`
- Daily rollup — `src/lib/fitscore/scoring-daily-metrics.ts`
- Extraction audit trail — `fitscore_extraction_log` (Supabase)
- Architecture overview — `docs/SCORING_ARCHITECTURE.md`
