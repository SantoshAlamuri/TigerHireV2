# FitScore V2 Promotion Playbook

## Preconditions

- `scoring_v2_shadow_enabled` has been ON long enough to collect stable baseline.
- `fit_scores_v2` rows are being written for active scoring traffic.
- Agreement, confidence, and cost dashboards are reviewed and accepted.

## Promotion Steps

1. Keep `scoring_v2_shadow_enabled=true`.
2. Turn on `scoring_v2_primary=true` for a limited org allowlist via overrides.
3. Observe for at least 24 hours:
   - score distribution drift
   - confidence spread
   - error rates on `fit_scores_v2` writes
4. Expand rollout in stages (10% -> 50% -> 100% orgs).
5. Keep V1 execution path active during the 2-week safety window.

## Rollback

1. Set `scoring_v2_primary=false`.
2. Keep `scoring_v2_shadow_enabled=true` for diagnosis unless incident severity requires full stop.
3. Investigate outliers with row-level `fit_scores` vs `fit_scores_v2` comparisons.

## Sunset Readiness Checklist

- No critical incidents during the full safety window.
- No customer-facing regressions requiring fallback.
- Stakeholder sign-off from Product + Engineering.
- PR approved to remove V1 write/read paths.
