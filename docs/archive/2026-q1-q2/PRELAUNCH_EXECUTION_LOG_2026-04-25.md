# Pre-Launch Execution Log (2026-04-25)

Checklist reference: `docs/verification/PRELAUNCH_RELEASE_CHECKLIST.md`

## Scope executed now

- Applied missing PR B migration to connected pre-launch production DB:
  - `20260425211500_referrals_target_phone_index`
- Re-validated PR B and PR C structural gates.
- Re-validated PR C flag seed gate.
- Captured current pre-launch baseline counts.

## Migration status (connected DB)

Observed via migration listing:

- `20260425211500_referrals_target_phone_index` (applied now)
- `20260425213500_vouch_depth3_cycle_check` (already present)
- `20260425221000_vouch_depth3_phone_regex_fix` (already present)
- `20260425224000_vouch_depth3_plan_shape_fix` (already present)

## Post-migration structural checks

### PR B

```json
{
  "referrals_target_phone_null": 0
}
```

```json
{
  "indexname": "idx_referrals_referrer_target_phone_created_at",
  "indexdef": "CREATE INDEX idx_referrals_referrer_target_phone_created_at ON public.referrals USING btree (referrer_id, target_phone, created_at DESC) WHERE (target_phone IS NOT NULL)"
}
```

### PR C

```json
{
  "indexname": "idx_candidates_phone_digits",
  "indexdef": "CREATE INDEX idx_candidates_phone_digits ON public.candidates USING btree (regexp_replace(COALESCE(phone, ''::text), '[^0-9]'::text, ''::text, 'g'::text)) WHERE (phone IS NOT NULL)"
}
```

```json
{
  "indexname": "idx_vouches_voucher_phone_candidate",
  "indexdef": "CREATE INDEX idx_vouches_voucher_phone_candidate ON public.vouches USING btree (voucher_phone, candidate_id)"
}
```

```json
{
  "proname": "check_circular_vouch_depth_3"
}
```

## Flag-state checks

### Audited flag read paths (code)

Audited from `isEnabled(...)` and global entitlement kill-switch mappings:

- `verify_agent`
- `ghostbuster_authenticity_agent`
- `whatsapp_referral_consent_v2`
- `consent_flow`
- `circular_vouch_depth_3`
- `scout_agent`
- `vouch_agent`
- `scheduler_agent`
- `orchestrator_agent_wiring_v1`
- `fitscore_hybrid_execution`
- `fitscore_budget_enforcement`
- `fitscore_prefilter_strict`
- `fitscore_hybrid_v2`
- `agents_run_global`
- `fitscore_batch_global`
- `assessments_global`
- `offers_global`
- `compensation_bands_global`
- `interview_prep_global`
- `scim_global`

### Seed block execution

Seed policy used:

- explicit comments for pre-launch intent per flag
- `INSERT ... ON CONFLICT (key) DO NOTHING` (no overwrite of existing rows)
- `description` + `updated_at` populated on inserted rows

Post-seed snapshot:

```json
[
  { "key": "agents_run_global", "enabled": true, "updated_at": "2026-04-26 07:28:42.938901+00" },
  { "key": "assessments_global", "enabled": true, "updated_at": "2026-04-26 07:28:42.938901+00" },
  {
    "key": "circular_vouch_depth_3",
    "enabled": false,
    "updated_at": "2026-04-25 15:52:08.374612+00"
  },
  {
    "key": "compensation_bands_global",
    "enabled": true,
    "updated_at": "2026-04-26 07:28:42.938901+00"
  },
  { "key": "consent_flow", "enabled": true, "updated_at": "2026-04-26 07:28:42.938901+00" },
  {
    "key": "fitscore_batch_global",
    "enabled": true,
    "updated_at": "2026-04-26 07:28:42.938901+00"
  },
  {
    "key": "fitscore_budget_enforcement",
    "enabled": true,
    "updated_at": "2026-04-26 07:28:42.938901+00"
  },
  {
    "key": "fitscore_hybrid_execution",
    "enabled": true,
    "updated_at": "2026-04-26 07:28:42.938901+00"
  },
  { "key": "fitscore_hybrid_v2", "enabled": true, "updated_at": "2026-04-26 07:28:42.938901+00" },
  {
    "key": "fitscore_prefilter_strict",
    "enabled": true,
    "updated_at": "2026-04-26 07:28:42.938901+00"
  },
  {
    "key": "ghostbuster_authenticity_agent",
    "enabled": true,
    "updated_at": "2026-04-26 07:28:42.938901+00"
  },
  {
    "key": "interview_prep_global",
    "enabled": true,
    "updated_at": "2026-04-26 07:28:42.938901+00"
  },
  { "key": "offers_global", "enabled": true, "updated_at": "2026-04-26 07:28:42.938901+00" },
  {
    "key": "orchestrator_agent_wiring_v1",
    "enabled": false,
    "updated_at": "2026-04-26 07:28:42.938901+00"
  },
  { "key": "scheduler_agent", "enabled": true, "updated_at": "2026-04-26 07:28:42.938901+00" },
  { "key": "scim_global", "enabled": true, "updated_at": "2026-04-26 07:28:42.938901+00" },
  { "key": "scout_agent", "enabled": true, "updated_at": "2026-04-26 07:28:42.938901+00" },
  { "key": "verify_agent", "enabled": true, "updated_at": "2026-04-26 07:28:42.938901+00" },
  { "key": "vouch_agent", "enabled": true, "updated_at": "2026-04-26 07:28:42.938901+00" },
  {
    "key": "whatsapp_referral_consent_v2",
    "enabled": false,
    "updated_at": "2026-04-26 07:28:42.938901+00"
  }
]
```

## Baseline counts (pre-launch snapshot)

```json
{
  "applications_count": 0,
  "candidates_count": 1
}
```

## Already-captured PR C performance artifact

Use artifact from current session for PR description:

- reproducible synthetic setup SQL
- `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` plan with expected index paths
- depth-3 seed row (`enabled=false`)

## Remaining checklist items (manual/operator)

- Sprint 1 Alice->Bob WhatsApp E2E (`flag OFF` and `flag ON`, YES/NO paths).
- Launch-day recheck:
  - re-run PR C EXPLAIN against real data distribution,
  - re-run full flag query set and confirm intended launch states,
  - re-check baseline counts and template approval.
