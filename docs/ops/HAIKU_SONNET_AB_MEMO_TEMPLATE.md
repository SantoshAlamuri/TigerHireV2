# Haiku vs Sonnet A/B Decision Memo

Date: 2026-05-03
Owner: Santosh + Codex
Job ID: f25a04b0-23e1-45d4-8eec-5ee20a5f5ca6

## Experiment setup

- Command:
  - `npm run ab:haiku-sonnet -- --job-id=<job-id> --sample-size=50 --json`
- Models:
  - Haiku: `claude-haiku-4-5-20251001`
  - Sonnet: `claude-sonnet-4-20250514`
- Metric focus:
  - extraction success rate,
  - critical-fields coverage (experience + tools + evidence),
  - latency.

## Results summary

- Sample size used: 5/50 requested (insufficient CV-rich candidates in this job to reach target sample)
- Haiku success rate: 100%
- Sonnet success rate: 100%
- Haiku critical-fields coverage: 100%
- Sonnet critical-fields coverage: 100%
- Haiku avg latency: 3050.4 ms
- Sonnet avg latency: 6911.2 ms

## Interpretation

- Quality delta (Sonnet - Haiku): no measurable delta on success/critical coverage in this sample.
- Throughput/cost trade-off: Haiku is materially faster (~56% lower latency) with no quality loss in observed sample.
- Risk notes (failure patterns, parse instability, edge CV formats): no parser failures in this run; Sonnet model deprecation warning observed and should be planned out before June 15, 2026.

## Decision

- [x] Keep Haiku primary only.
- [ ] Add Sonnet shortlist-tier for selected candidates.
- [ ] Full Sonnet for all candidates.

Decision rationale:
For current traffic, keep Haiku as primary because no quality gain was observed with Sonnet and latency doubled. This memo remains provisional because the target 50-candidate sample and 10 disagreement-case review could not be completed from available CV-rich rows.

## Follow-up actions

- Owner: Platform / FitScore
- Delivery date: before rollout gate closes
- Required code/config changes:
  - Update Sonnet fallback model version to a non-deprecated model.
  - Re-run this memo at true n=50 and append 10 disagreement-case manual review.
