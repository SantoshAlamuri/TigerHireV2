# V3 Scoring Cascade — Pre-flight (before any flag flip)

**Database:** TigerHire Supabase `htdyomyhkvhcwoeodwas` ([dashboard](https://supabase.com/dashboard/project/htdyomyhkvhcwoeodwas)). Soak on **dev preview** (same DB unless you maintain a separate staging project). **All `ff_*` flags stay OFF** until each step passes.

---

## 0. Cost baseline (record **before** any flag flip)

Step 1 (path unification) is **correctness / observability**, not a major cost win — prod null v2 rows were a backfill artifact, not active rogue routing (see [caller trace](./v3-cascade-phase1-caller-trace.md)). **Real ₹/profile movement expects Step 2 (Haiku)**, not Step 1.

Capture a measured baseline on the **current** path (Sonnet + merged where env already merged):

```sql
-- Snapshot window (adjust dates; run once, paste into PR/soak notes)
SELECT
  metadata->>'label' AS label,
  count(*) AS events,
  round(sum(amount_usd)::numeric, 4) AS usd
FROM platform_cost_events
WHERE created_at BETWEEN :baseline_start AND :baseline_end
  AND provider = 'anthropic'
  AND metadata->>'label' IN (
    'cv-parser-text',
    'fitscore-hybrid-extraction',
    'fitscore-hybrid-extraction-verdict',
    'fitscore-hybrid-explanation'
  )
GROUP BY 1
ORDER BY events DESC;

-- Per-profile (pair ledger rows to a scored fit_scores row in the same window)
WITH scored AS (
  SELECT fs.job_id, fs.candidate_id, fs.created_at
  FROM fit_scores fs
  WHERE fs.created_at BETWEEN :baseline_start AND :baseline_end
    AND fs.scoring_status = 'scored'
    AND fs.scoring_version = 2
),
costs AS (
  SELECT
    (p.metadata->>'jobId')::uuid AS job_id,
    p.candidate_id,
    sum(p.amount_usd) AS usd
  FROM platform_cost_events p
  WHERE p.created_at BETWEEN :baseline_start AND :baseline_end
    AND p.provider = 'anthropic'
  GROUP BY 1, 2
)
SELECT
  count(*) AS profiles,
  round(avg(c.usd)::numeric, 4) AS avg_usd_per_profile
FROM scored s
JOIN costs c ON c.job_id = s.job_id AND c.candidate_id = s.candidate_id;
```

**Recorded baseline (prod, 30d Anthropic labels, 2026-06-04):** merged verdict ~472 events / $8.01 USD; cv-parser-text 66 / $2.05; split extraction 33 / $0.10; explanation 18 / $0.01. Use your pilot window for INR (FX × USD) — do not reuse old ₹7.60 / ₹2.40 from memory.

- [ ] Baseline USD (and INR if needed) saved in PR or soak ticket **before** enabling `ff_path_unification`.

---

## 0b. Schema + backfill (with migrations PR)

- [ ] Apply migration chain on `htdyomyhkvhcwoeodwas` after PR review (includes cascade tables + backfill).
- [ ] Backfill verified: 120 rows `scoring_version=2`, `scoring_method` NULL, all have `v2_extraction` + `v2_explanation` → safe to set `hybrid_merged` (migration `20260604140000_backfill_scoring_method_hybrid_merged.sql`).
- [ ] Six flags exist and **OFF**:
  ```sql
  SELECT key, enabled FROM feature_flags
  WHERE key IN (
    'ff_path_unification','ff_haiku_extraction','ff_structured_jd',
    'ff_whatsapp_gate','ff_cascade_rerank','ff_ctc_tiering'
  )
  ORDER BY key;
  ```

---

## 1. `ff_path_unification` only (expect correctness, not big savings)

**Enable:** `ff_path_unification` for pilot org only.

**Expect:** `scoring_method` always set; legacy split branch unreachable; **little change to blended ₹/profile** if you are already on merged env for most scores.

**Run:** 10+ scores on approved JD Base jobs.

```sql
SELECT fs.scoring_method, count(*)
FROM fit_scores fs
JOIN jobs j ON j.id = fs.job_id
WHERE fs.created_at > now() - interval '7 days'
  AND fs.scoring_status = 'scored'
  AND j.organisation_id = :pilot_org_id
GROUP BY fs.scoring_method;

SELECT metadata->>'label' AS label, count(*) AS n
FROM platform_cost_events p
JOIN jobs j ON j.id = (p.metadata->>'jobId')::uuid
WHERE p.created_at > :soak_start
  AND j.organisation_id = :pilot_org_id
  AND metadata->>'label' IN (
    'fitscore-hybrid-extraction',
    'fitscore-hybrid-extraction-verdict',
    'fitscore-hybrid-explanation',
    'fitscore_extraction_validation_failed'
  )
GROUP BY 1 ORDER BY n DESC;
```

- [ ] No new `scoring_method IS NULL` on scored rows.
- [ ] No `fitscore_extraction_validation_failed` retry bursts (≤1 extraction label per score).
- [ ] Cost vs §0 baseline: **flat or small** is OK for Step 1.

**Rollback:** `ff_path_unification` OFF for org.

---

## 1b. Evidence quote validator (before regression or INR measurement)

Merged-path validation must not reject good extractions on whitespace/smart-quote drift (model-independent).

- Code: `src/lib/fitscore/hybrid/quote-validation.ts` — normalize match, `quote_anchor` resolution, fill missing dimensions with `NO_DEFENSIBLE_QUOTE`.
- **Do not** run ±0.5 regression or quote a per-profile INR while validation failures are dominated by substring false negatives.

## 2. `ff_haiku_extraction` — **hold until regression**

**Prerequisites:** Step 1 passed; §1b validator fix deployed; baseline from §0 recorded; regression **±0.5** on labeled set (see [regression](./v3-cascade-regression.md)).

**Enable:** `ff_haiku_extraction` (keep path unification ON).

**Pass:** Haiku on parse + merged extraction; blended cost ≤ **₹2.40/profile** on a **unified-path-only** 2-profile run (compare to §0 baseline, not memory).

**Rollback:** `ff_haiku_extraction` OFF.

---

## 3. Later flags

[pilot gate checklist](./v3-cascade-pilot-gate-checklist.md) before `ff_structured_jd`, `ff_whatsapp_gate`, `ff_cascade_rerank`, `ff_ctc_tiering`.

---

## PR

- Branch `claude/cascade-v3-scoring` → `dev`; link this doc + caller trace; paste acceptance SQL; regression section filled before merge.
