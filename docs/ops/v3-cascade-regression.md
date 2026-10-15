# V3 Cascade — Haiku regression (before `ff_haiku_extraction`)

**Gate:** Max **±0.5** on displayed 0–100 score vs Sonnet baseline on the **same** jobs/candidates, with `ff_path_unification` ON for both runs.

## Automated (CI / PR)

```bash
npm run typecheck
npm test -- tests/unit/cascade-feature-flags.test.ts \
  tests/unit/cascade-boundary.test.ts \
  tests/unit/cascade-path-unification-guard.test.ts
```

## Labeled golden run (operator, before merge if Haiku is in scope)

1. Pick 5–10 `(job_id, candidate_id)` pairs with approved JD Base and stable CVs (export from prod or QA job).
2. **Baseline (Sonnet):** `ff_path_unification` ON, `ff_haiku_extraction` OFF — rescore with force:
   ```bash
   # Example; set JOB_ID / candidate ids in script or use compare-rescore-fitscores.ts
   npx tsx scripts/compare-rescore-fitscores.ts
   ```
3. **Candidate (Haiku):** same pairs, `ff_haiku_extraction` ON for pilot org.
4. Record `|score_haiku - score_sonnet| ≤ 0.5` for each pair.

## PR checklist row

| Check                                            | Status                                      |
| ------------------------------------------------ | ------------------------------------------- |
| Unit tests (cascade flags, boundary, path guard) | Run in CI                                   |
| Golden ±0.5 (labeled set)                        | Required before enabling Haiku on pilot org |

**This PR:** path unification + schema + guards only — flags OFF. Golden run can complete during dev preview soak before Haiku flag flip (not required to merge code if Haiku stays OFF).
