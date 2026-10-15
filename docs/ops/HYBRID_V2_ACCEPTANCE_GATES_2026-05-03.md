# Hybrid v2 Acceptance Gates Report (2026-05-03)

Owner: Santosh + Codex  
Window: last 24h unless stated otherwise

**Hardening sequencing:** Empirical gates below inform rollout; **implementation order** for caching / concurrency / evidence / confidence is **`docs/ops/FITSCORE_HARDENING_PRD.md` §6**. **Day 0** — ledger gate — **`docs/briefs/platform-cost-ledger-hardening.md`** (complete before other §6 items).

## Raw command outputs used

- `npm run diagnostic:hybrid-path-mix -- --hours=24 --min-organic-hybrid-pct=80 --json`
  - `total=0`, `organicHybridPct=0`, `thresholdPassed=false`
- `npm run ab:haiku-sonnet -- --job-id=f25a04b0-23e1-45d4-8eec-5ee20a5f5ca6 --sample-size=50 --json`
  - sample used `5` (not `50`)
- Inline 24h metrics query against `platform_cost_events` + latest `fit_scores` sample:
  - `cacheHitRatePct=0`
  - `estimatedInputCostReductionPct=0`
  - `batchConcurrencyHighWaterMark=1`
  - `batchConcurrencyConfiguredLimit=5`
  - score sample rows=`25`
  - confidence distribution: `high=0`, `medium=10`, `low=15`, `unknown=0`
  - evidence quote exact-substring pass in latest 20 rows: `3/20`

## Threshold status

| Gate                                       | Threshold        | Observed                             | Status              |
| ------------------------------------------ | ---------------- | ------------------------------------ | ------------------- |
| Cache hit rate (24h)                       | >= 85%           | 0%                                   | FAIL                |
| Input cost reduction (100-candidate batch) | >= 25%           | 0% (no qualifying 100-candidate run) | FAIL                |
| Labeled regression set delta               | within +/-0.5    | Not produced in this run             | PENDING             |
| Concurrent batch load                      | 50x3             | High-water mark 1                    | FAIL                |
| Confidence distribution check              | 100 scores       | 25 available rows                    | PENDING SAMPLE SIZE |
| Evidence quote review                      | 20 manual checks | 3/20 pass (exact substring)          | FAIL                |

## Investigation status

- Investigation A (Haiku vs Sonnet): partial complete (5/50). No quality delta, Haiku latency materially better; disagreement review not possible at required size.
- Investigation B (Path-mix): complete command run; gate failed due no in-window organic sample.

## Rollout decision

- Keep `FF_VERDICT_CV_EVIDENCE` = OFF in production.
- Keep `FF_CONFIDENCE_BAND` = OFF in production.
- Re-run all failed/pending gates after:
  - sufficient production sample volume exists,
  - 100-candidate batch test is executed,
  - labeled regression delta report is generated.

## Flag flip status (48h soak gate)

- Staging soak prerequisite: **not satisfied** (empirical gates currently failing/pending).
- Production flip executed: **No**.
- Monitoring plan when flip is eventually approved:
  - watch `/admin/fitscore-observability` every 2h for first 24h post-flip,
  - monitor Sentry for new scoring/verdict-card errors,
  - inspect evidence quote pass rate and confidence drift.
- Rollback trigger after flip:
  - any sustained drop in evidence quote validation pass rate below pre-flip baseline,
  - cache hit collapse or batch pressure anomalies,
  - recruiter-facing verdict/evidence regressions.
- Rollback action:
  - set `FF_VERDICT_CV_EVIDENCE=false`,
  - set `FF_CONFIDENCE_BAND=false`,
  - redeploy and re-check observability metrics.
