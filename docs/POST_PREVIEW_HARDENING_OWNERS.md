# Post-Preview Hardening Owners

This list captures "silent-skip" items so they do not disappear after preview.

## Fast checks completed now

- **Stripe webhook signature verification**: verified in `src/app/api/webhooks/stripe/route.ts` via `stripe.webhooks.constructEvent(...)` + `stripe-signature` header gate.
- **Forgot-password account existence leak**: verified in `src/app/api/auth/forgot-password/route.ts`; success and cooldown responses are existence-agnostic (`"If an account exists..."`), no user-existence branch.
- **Reliability Signal (beta)** UI naming on candidate cards (`ghost_risk_score` heuristic; path `src/components/dashboard/FitScoreCard.tsx`).

## Hardening backlog with owners

| Item                                                             | Owner        | Target Window          | Notes                                                                                                        |
| ---------------------------------------------------------------- | ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Parked:** Investigate ~80% PDF → Sonnet vision fallback rate   | Platform/ML  | After ledger gate      | **Unblock:** ledger acceptance passes (`docs/briefs/platform-cost-ledger-hardening.md`). Separate brief TBD. |
| PgBouncer / connection pooling readiness                         | Platform Eng | GA-1                   | Finalize Supabase pooled connection path and run load check with cron overlap.                               |
| Resume malware scanning (ClamAV/VirusTotal path)                 | Security Eng | GA+1                   | Byte sniffing is live; malware scan still pending.                                                           |
| Cursor pagination for large lists                                | Backend Eng  | GA+1                   | Move heavy list endpoints from offset to cursor paging.                                                      |
| Bulk mutation idempotency keys                                   | Backend Eng  | When bulk actions ship | Tie to bulk actions + CSV implementation.                                                                    |
| Inngest lifecycle cleanup (remove unused or fully wire)          | Platform Eng | GA-1                   | Avoid orphan infra and hidden runtime drift.                                                                 |
| Additional `next/image` + font optimization pass                 | Frontend Eng | GA+1                   | Improve perceived speed on avatar/logo-heavy pages.                                                          |
| Circuit breaker single-flight probe for half-open                | Platform Eng | GA+1                   | Prevent request stampede right after open-window expiry.                                                     |
| Reliability Signal v2 data capture schema (`reliability_events`) | Data/ML Eng  | GA+1                   | Needed now for Oct model training runway.                                                                    |

## Explicitly deferred (do not reopen during preview)

- SAML 2.0
- SCIM 2.0 provisioning
- Naukri API integration
- Double-submit CSRF token
- Bulk actions + CSV export
- Boolean search (conditional)
