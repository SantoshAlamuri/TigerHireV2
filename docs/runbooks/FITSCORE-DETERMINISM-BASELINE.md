# FitScore Determinism Baseline — Runbook

**Purpose.** Capture a measured number for "how consistent is FitScore when the same candidate is scored against the same job multiple times in a row?" The output is a **coefficient of variation (CV)** percentage that you can quote to design partners during beta. Target: **CV < 5%** for world-class consistency. The repo expects scoring to be stable after the temperature-0 fix that landed earlier in the FitScore pipeline.

**Why now.** Listed as the next-most-important beta activity in [`docs/PRE_LAUNCH_CRITICAL_TODO.md`](../PRE_LAUNCH_CRITICAL_TODO.md). Once you have a baseline number, you can re-run weekly during beta to catch regressions caused by model changes, prompt edits, or upstream parsing drift.

**Script:** [`scripts/verify-fit-score-determinism.mjs`](../../scripts/verify-fit-score-determinism.mjs). Reads a job + candidate from Supabase, calls the FitScore API 10 times in a row with `forceRescore=true`, and reports mean, std dev, CV, min, max, range.

---

## Prerequisites (one-time)

1. **`.env.local` set up** with at minimum:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY` (for the model calls — each run costs real money; ~$0.05–$0.50 total for 10 runs depending on candidate/JD size and which Claude model the pipeline routes to)
2. **Local dev server runnable** with `npm run dev`.
3. **At least one job + one candidate** in the Supabase project the script will hit. Pick a candidate whose CV has already been parsed (`parse_quality` is good) so the variance you measure is real model variance, not parsing flakiness.

---

## Run the baseline (~15 minutes)

```bash
# 1. Start the app in one terminal — leave it running
npm run dev

# 2. Pick a job ID and candidate ID (look in your Supabase dashboard, or use a
#    pair you know works well together). Then in a SECOND terminal:
export FIT_SCORE_JOB_ID="<paste-job-uuid>"
export FIT_SCORE_CANDIDATE_ID="<paste-candidate-uuid>"

# 3. Run the script with the output file flag so results get saved
CONSISTENCY_OUTPUT_FILE=docs/runbooks/baselines/fit-score-determinism-$(date +%Y-%m-%d).json \
  node --env-file=.env.local scripts/verify-fit-score-determinism.mjs \
    "$FIT_SCORE_JOB_ID" "$FIT_SCORE_CANDIDATE_ID"
```

The script prints all 10 scores and the statistics to stdout AND saves a structured JSON file under `docs/runbooks/baselines/`. Commit the JSON file as part of your evidence trail.

---

## Interpreting the output

```
Scores: [82, 81, 83, 82, 82, 81, 83, 82, 82, 81]

Statistics:
  Mean:              81.90
  Std Dev:           0.83
  Coefficient of Variation (CV): 1.01%
  Min:               81
  Max:               83
  Range:             2

✅ CONSISTENT (Target: CV < 5%)
```

| CV value  | What to do                                                                                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **< 1%**  | Excellent. Quote this number to design partners as-is. Re-run weekly during beta.                                                                                                             |
| **1–5%**  | Acceptable for beta. Note the variance in your partner intro materials so expectations are calibrated.                                                                                        |
| **5–10%** | Investigate. Likely culprits: model temperature drift, non-deterministic extraction (CV parser instability), or scoring code that uses `Math.random()` / `Date.now()` somewhere it shouldn't. |
| **> 10%** | **Beta blocker.** Do not ship until root-caused. Most likely a regression in the temperature-0 fix or a new agent step that introduced randomness.                                            |

---

## Troubleshooting

- **`API endpoint unavailable, using direct computation...`** — the dev server isn't running, or it's not on `localhost:3000`. Set `NEXT_PUBLIC_APP_URL` if you use a different port.
- **`API auth required, using direct computation...`** — the `/api/admin/fitscore-test` endpoint needs super_admin auth. The script falls back to the public `/api/fit-score` endpoint, which should work without auth for valid candidate+job pairs. If both fail, set `AUTH_TOKEN` to a super_admin bearer token.
- **`Job not found` / `Candidate not found`** — double-check the IDs are UUIDs from the project pointed at by `.env.local`, not a different environment.
- **Costs spiking** — each run does full extraction + scoring. If your candidate has a 20-page CV, you can burn $0.50–$1.00 per run. For a baseline, pick a representative-but-typical candidate, not your largest one.

---

## Capturing the evidence

After a successful run:

1. **Verify a results JSON file exists** under `docs/runbooks/baselines/fit-score-determinism-YYYY-MM-DD.json`. The script writes it automatically when `CONSISTENCY_OUTPUT_FILE` is set.
2. **Commit it** on a `claude/fit-score-determinism-baseline-YYYY-MM-DD` branch with a commit message like:

   ```
   chore(beta): capture FitScore determinism baseline 2026-MM-DD

   Mean: NN.NN, CV: N.NN%, range: N. Job: <title>, candidate: <name>.
   ```

3. **Update the PRE-LAUNCH-INFRA-CHECKLIST row** (if you add one for this) with the CV percentage so future readers know it's been measured.

---

## How often to re-run

| Trigger                                   | Action                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| Before each new design partner kicks off  | Once, with their type of candidate if possible                                              |
| After any FitScore prompt or model change | Always — this is the regression check                                                       |
| Weekly during beta                        | Light cadence; pick the same job+candidate pair each time for trend visibility              |
| Before broader GA launch                  | Run across 3–5 different job/candidate pairs to confirm consistency holds across role types |
