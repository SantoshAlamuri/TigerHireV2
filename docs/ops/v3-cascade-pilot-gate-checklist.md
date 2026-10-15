# V3 Scoring Cascade — Pilot Gate Checklist

**Stop:** Do not enable Phase 4 (`ff_cascade_rerank`) or Phase 5 (`ff_ctc_tiering`) until this gate is signed off.

**Welded path note:** On the merged path, extraction and verdict share one `fitscore-hybrid-extraction-verdict` call. Phase 4 **lazy verdict** defers that whole merged call when nobody opens a candidate — not a separate Sonnet verdict line.

**Haiku result (2026-06-04):** `ff_haiku_extraction` **FAILED** the ±0.5 gate (max |Δ| 5, directional inflation) — see `docs/ops/active-track-plan.md`. It stays **OFF**. The merged path is **Sonnet-only**. Under B-everyone, cascade/lazy-verdict is ranking-quality (nothing to defer when all get a verdict); the real cost levers are the parked **Batch API (50%)** + **volume-tiered depth**.

## Prerequisites

- Phases 0–3 deployed (no specific pilot org — measure on real usage; see `docs/ops/active-track-plan.md`)
- Flags on staging/production:
  - `ff_path_unification`
  - ~~`ff_haiku_extraction`~~ — **stays OFF** (failed ±0.5)
  - `ff_structured_jd` (if using structured approval)
  - `ff_whatsapp_gate` (if using WhatsApp prescreen)

## Metrics to record

### 1. HM agreement (golden shortlist)

- [ ] Pick 1–2 approved jobs with ≥20 scored candidates
- [ ] HM labels top 10: Strong Hire / No Hire (spreadsheet or in-app feedback)
- [ ] Compare to TigerHire top 10 (`overall_score` order)
- [ ] **Pass:** ≥80% overlap on Strong Hire / No decisions

### 2. Blended cost per profile (Sonnet-merged — measure, don't target)

The old **≤₹2.40/profile** target assumed Haiku on the extraction leg; that assumption is dead. Now this is a **measurement**, not a pass/fail: capture the real Sonnet-merged ₹/profile on actual usage, then optimize via cascade.

- [ ] Real ₹/profile captured via the standing query pack (`docs/ops/active-track-plan.md`)
- [ ] Number recorded for the pitch (replaces any Haiku-assumed figure)
- [ ] Cascade economics modeled against it before claiming a "cheap" number externally

### 3. Path unification (SQL — org optional)

```sql
SELECT scoring_method, count(*)
FROM fit_scores
WHERE created_at > now() - interval '7 days'
  -- AND organisation_id = :org_id   -- optional; omit to measure all real usage
GROUP BY scoring_method;
```

- [ ] **Pass:** no new `scoring_method IS NULL` rows; `hybrid_merged` dominates

### 4. Prescreen gate (if `ff_whatsapp_gate` ON)

```sql
SELECT count(*)
FROM platform_cost_events
WHERE candidate_id = :gated_candidate_id
  AND created_at > :gate_failed_at;
```

- [ ] **Pass:** count = 0 after failed gate

## Sign-off

| Reviewer | Date | HM agreement | Cost/profile | Notes |
| -------- | ---- | ------------ | ------------ | ----- |
| Santosh  |      |              |              |       |

After sign-off, proceed with Phase 4 PR (`ff_cascade_rerank`) and Phase 5 (`ff_ctc_tiering`).
