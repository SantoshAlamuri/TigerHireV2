# Hybrid v2 Path-Mix Diagnostic

Purpose: verify that new production scoring traffic is routing to Hybrid v2 organically before enabling recruiter-facing rollout switches.

## Gate

- Target: `organicHybridPct >= 80` over the last 24 hours.
- If gate fails, do not enable evidence/confidence rollout switches in production.

## Command

```bash
npm run diagnostic:hybrid-path-mix -- --hours=24 --min-organic-hybrid-pct=80
```

Optional JSON output:

```bash
npm run diagnostic:hybrid-path-mix -- --hours=24 --min-organic-hybrid-pct=80 --json
```

## Current logic

The script reads active production rows from `fit_scores` in the window and computes:

- `hybridCount`: rows with `scoring_version >= 2`
- `legacyCount`: rows with `scoring_version < 2`
- `backfillTaggedHybridCount`: hybrid rows where `scoring_status_reason` contains `backfill`
- `organicHybridCount = hybridCount - backfillTaggedHybridCount`
- `organicHybridPct = organicHybridCount / totalRows`

## Operational notes

- The organic calculation depends on backfill rows being tagged with `backfill` in `scoring_status_reason`.
- If backfill tagging is missing, `organicHybridPct` will equal `hybridPct`.
- For each rollout decision, paste command output into your rollout evidence thread or release control sheet.

## Internal Verdict-Card QA (one card)

Run:

```bash
npm run review:verdict-card -- --job-id=<job-id> --candidate-id=<candidate-id>
```

or let the script select the latest active Hybrid v2 row:

```bash
npm run review:verdict-card
```

The script outputs score/verdict/confidence plus substring validation for each evidence quote, followed by a manual reviewer checklist.

## Latest run (2026-05-03)

Command:

```bash
npm run diagnostic:hybrid-path-mix -- --hours=24 --min-organic-hybrid-pct=80 --json
```

Output snapshot:

```json
{
  "total": 0,
  "hybridCount": 0,
  "legacyCount": 0,
  "backfillTaggedHybridCount": 0,
  "organicHybridCount": 0,
  "organicHybridPct": 0,
  "thresholdPassed": false
}
```

Decision: **ESCALATE**. There is no 24h production sample in the current window, so this gate cannot be closed. Keep rollout switches OFF and re-run once traffic exists in-window.
