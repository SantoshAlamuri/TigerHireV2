# FitScore V2 Change Notes Template

## What changed

- FitScore now includes a confidence band with lower/upper bounds.
- Score explainability now exposes finer-grained sub-signal structure.

## Why this changed

- Improve role specificity and evidence transparency.
- Differentiate strong-evidence scores from thin-evidence scores.

## What customers should expect

- Some candidates may shift score band where evidence quality differs.
- Confidence signals should guide interview prioritization for close calls.

## Support playbook

- If a customer reports an unexpected score shift:
  1. Compare latest V1 and V2 entries for the candidate-job pair.
  2. Check confidence bounds and evidence breakdown.
  3. If needed, temporarily keep tenant on V1 primary until review closes.
