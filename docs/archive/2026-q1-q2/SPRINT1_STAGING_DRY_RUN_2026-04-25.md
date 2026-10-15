# Sprint 1 Staging Dry-Run Artifact (2026-04-25)

## Recoverability Baseline Query Output

```json
{
  "sessions_with_referral_context": 0,
  "referrals_missing_candidate_id": 0,
  "sessions_error": null,
  "referrals_error": null
}
```

```json
{
  "supabase_host": "htdyomyhkvhcwoeodwas.supabase.co",
  "applications": 0,
  "candidates": 1
}
```

## Backfill Dry-Run Output

```text
> tigerhire@0.1.0 backfill:referrals-candidate-id
> npx tsx --env-file=.env.local scripts/backfill-referrals-candidate-id.ts --dry-run

No referral->candidate pairs found in whatsapp_sessions context.
```

## Notes

- Dry-run found no candidate/referral pairs in `whatsapp_sessions.context`.
- Confirmed by Santosh on 2026-04-25: `htdyomyhkvhcwoeodwas` is the production environment, currently pre-launch with one test user.
- Low-volume counts (`applications=0`, `candidates=1`) are expected at snapshot time because data was intentionally cleaned for owner testing.
- This dry-run is therefore production-scoped; the zero-backlog finding is genuine for the pre-launch state at time of capture.
- Re-run obligation: run the same dry-run at launch cutover and again post-launch as traffic grows.

## Meta Template Status Check (same date)

Template status sampled via Graph API on WABA `26664671319819708`:

```json
{
  "tigerhire_consent_v2": "APPROVED",
  "tigerhire_referral_v2": "APPROVED",
  "tigerhire_referral_v1": "APPROVED"
}
```

Trigger-to-template mapping used by T3 code path:

- Trigger: `captureConsentViaWhatsApp(..., "referred_candidate")`
- Service fallback call: `sendConsentRequest(phone, triggerType)`
- Concrete template name: `tigerhire_consent_v2` (with trigger-specific body param text)

This mapping means the T3 fallback template dependency is specifically `tigerhire_consent_v2`.
