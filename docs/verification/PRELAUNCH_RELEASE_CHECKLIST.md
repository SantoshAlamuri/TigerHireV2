# Pre-Launch Release Checklist (Sprint 1 + Sprint 2)

Purpose: one execution checklist for merging, migrating, verifying, and launch-gating the current pre-launch release stack (Sprint 1 + Sprint 2 PR A/B/C).

Last updated: 2026-04-25

---

## 0) Roles and Session Metadata

- [ ] **Operator assigned** (runs migrations + executes checklist)
- [ ] **Reviewer assigned** (independent checker)
- [ ] **Environment confirmed** (`htdyomyhkvhcwoeodwas`, pre-launch production)
- [ ] **Window confirmed** (off-hours, owner testing only)

Record:

- Operator:
- Reviewer:
- Start time (UTC):
- End time (UTC):

---

## 1) Merge + Deploy Order (Do Not Reorder)

1. PR A (trust scoring hardening)
2. PR B (abuse hardening) — migration first, then code
3. PR C (depth-3 circular vouch) — migrations + code

Checklist:

- [ ] PR A merged
- [ ] PR B merged
- [ ] PR C merged
- [ ] Deployment completed for merged code

---

## 2) Required Migration Order

Apply and verify in this order:

1. `20260425211500_referrals_target_phone_index.sql` (PR B)
2. `20260425213500_vouch_depth3_cycle_check.sql` (PR C base)
3. `20260425221000_vouch_depth3_phone_regex_fix.sql` (PR C regex/index alignment fix)
4. `20260425224000_vouch_depth3_plan_shape_fix.sql` (PR C plan-shape fix)

Checklist:

- [ ] Migration 1 applied
- [ ] Migration 2 applied
- [ ] Migration 3 applied
- [ ] Migration 4 applied

Capture:

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260425211500',
  '20260425213500',
  '20260425221000',
  '20260425224000'
)
ORDER BY version;
```

---

## 3) Post-Migration Structural Checks

### 3.1 PR B checks

- [ ] `referrals.target_phone` exists
- [ ] dedup index exists
- [ ] historical null count captured

```sql
SELECT count(*) AS referrals_target_phone_null
FROM referrals
WHERE target_phone IS NULL;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND tablename='referrals'
  AND indexname='idx_referrals_referrer_target_phone_created_at';
```

### 3.2 PR C checks

- [ ] `idx_candidates_phone_digits` exists
- [ ] `idx_vouches_voucher_phone_candidate` exists
- [ ] `check_circular_vouch_depth_3` function exists

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND tablename='candidates'
  AND indexname='idx_candidates_phone_digits';

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND tablename='vouches'
  AND indexname='idx_vouches_voucher_phone_candidate';

SELECT proname
FROM pg_proc
WHERE proname = 'check_circular_vouch_depth_3';
```

---

## 4) Flag State Verification (Pre-Launch Gate)

### 4.1 PR A flags

- [ ] `verify_agent` row checked
- [ ] `ghostbuster_authenticity_agent` row checked

```sql
SELECT key, enabled, updated_at
FROM feature_flags
WHERE key IN ('verify_agent', 'ghostbuster_authenticity_agent')
ORDER BY key;
```

### 4.2 PR C flag

- [ ] `circular_vouch_depth_3` row exists
- [ ] `enabled = false` confirmed

```sql
SELECT key, enabled, updated_at
FROM feature_flags
WHERE key = 'circular_vouch_depth_3';
```

### 4.3 Sprint 1 operational flags

- [ ] `whatsapp_referral_consent_v2` state recorded
- [ ] `consent_flow` state recorded

```sql
SELECT key, enabled, updated_at
FROM feature_flags
WHERE key IN ('whatsapp_referral_consent_v2', 'consent_flow')
ORDER BY key;
```

---

## 5) PR C Explain-Analyze Artifact (Plan Shape Gate)

Required outcome:

- candidate phone lookup uses `idx_candidates_phone_digits`
- vouch hop uses `idx_vouches_voucher_phone_candidate` (or acceptable existing voucher-phone index path)
- no large filter waste (`Rows Removed by Filter` not indicating broad scan path)

Use this reproducible script and attach both setup + output:

```sql
BEGIN;

INSERT INTO public.candidates (name, phone, created_at, updated_at)
SELECT 'perf_art_cand_' || g, '+9194' || lpad(g::text, 8, '0'), now(), now()
FROM generate_series(1, 5000) AS g;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY name) AS rn
  FROM public.candidates
  WHERE name LIKE 'perf_art_cand_%'
)
INSERT INTO public.vouches (candidate_id, voucher_phone, relationship_type, duration, skills_vouched, created_at)
SELECT
  r.id,
  CASE
    WHEN r.rn <= 1700 THEN '919999920001'
    WHEN r.rn <= 3200 THEN '919999920002'
    ELSE '9198' || lpad((r.rn % 1000)::text, 8, '0')
  END,
  'peer',
  '1_2y',
  '[]'::jsonb,
  now()
FROM ranked r
WHERE r.rn <= 4600;

INSERT INTO public.candidates (name, phone, created_at, updated_at)
VALUES
  ('perf_art_node_a', '+91 98111 22233', now(), now()),
  ('perf_art_node_b', '+91 98222 33344', now(), now()),
  ('perf_art_node_c', '+91 98333 44455', now(), now());

WITH nodes AS (
  SELECT name, id, regexp_replace(phone, '[^0-9]', '', 'g') AS phone_digits
  FROM public.candidates
  WHERE name IN ('perf_art_node_a', 'perf_art_node_b', 'perf_art_node_c')
),
a AS (SELECT id, phone_digits FROM nodes WHERE name = 'perf_art_node_a'),
b AS (SELECT id, phone_digits FROM nodes WHERE name = 'perf_art_node_b'),
c AS (SELECT id, phone_digits FROM nodes WHERE name = 'perf_art_node_c')
INSERT INTO public.vouches (candidate_id, voucher_phone, relationship_type, duration, skills_vouched, created_at)
SELECT c.id, b.phone_digits, 'peer', '1_2y', '[]'::jsonb, now() FROM b, c
UNION ALL
SELECT a.id, c.phone_digits, 'peer', '1_2y', '[]'::jsonb, now() FROM a, c;

ANALYZE public.candidates;
ANALYZE public.vouches;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
WITH params AS (
  SELECT
    regexp_replace('+91 98111 22233', '[^0-9]', '', 'g') AS new_voucher_phone,
    regexp_replace('+91 98222 33344', '[^0-9]', '', 'g') AS new_candidate_phone
),
candidate_a AS MATERIALIZED (
  SELECT c.id
  FROM public.candidates c
  CROSS JOIN params p
  WHERE c.phone IS NOT NULL
    AND regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = p.new_voucher_phone
)
SELECT EXISTS (
  SELECT 1
  FROM params p
  JOIN candidate_a a ON true
  JOIN public.vouches v_bc ON v_bc.voucher_phone = p.new_candidate_phone
  JOIN public.candidates c_mid ON c_mid.id = v_bc.candidate_id
  JOIN public.vouches v_ca
    ON v_ca.candidate_id = a.id
   AND v_ca.voucher_phone = regexp_replace(coalesce(c_mid.phone, ''), '[^0-9]', '', 'g')
  LIMIT 1
);

ROLLBACK;
```

Checklist:

- [ ] EXPLAIN output captured
- [ ] expected index paths confirmed
- [ ] artifact linked in PR C description

---

## 6) Sprint 1 Manual E2E (Alice -> Bob)

Run against pre-launch production (owner-only traffic):

- [ ] `whatsapp_referral_consent_v2 = OFF` baseline pass
- [ ] `whatsapp_referral_consent_v2 = ON` pass
- [ ] YES consent branch validated
- [ ] NO consent branch validated (`opted_out`, no further prompts)
- [ ] application attribution verified (`direct_referrer_id`, optional `parent_referrer_id`)
- [ ] refer-again loop verified (second referral works)

Reference runbook: `docs/SPRINT1_REFERRAL_CONSENT_VERIFICATION_RUNBOOK.md`

---

## 7) Metric Monitoring Window

Pre-launch (owner-only) acceptance:

- [ ] manual E2E matrix succeeded
- [ ] no critical metric errors

Post-launch acceptance (re-enable strict thresholds):

- `metric.whatsapp_referrer_resolved`
- `metric.whatsapp_referred_candidate_consent_routed`
- `metric.referrals_candidate_linked`
- `metric.referral_rate_limited`
- `metric.circular_vouch_blocked`

---

## 8) Rollback Readiness (Must be < 5 minutes)

- [ ] Operator can flip `verify_agent` OFF
- [ ] Operator can flip `ghostbuster_authenticity_agent` OFF
- [ ] Operator can keep `circular_vouch_depth_3` OFF (or flip OFF if enabled for testing)
- [ ] Operator can flip `whatsapp_referral_consent_v2` OFF
- [ ] Operator knows env rollback knobs for OTP/referral rate limits

---

## 9) Launch-Day Recheck Gates

Immediately before external traffic:

- [ ] re-run PR C EXPLAIN ANALYZE against real data shape
- [ ] re-run all feature flag state queries (including `circular_vouch_depth_3`)
- [ ] re-check baseline counts (`applications`, `candidates`, backlog/null counts)
- [ ] confirm WhatsApp template approval still valid (`tigerhire_consent_v2`)

---

## 10) Evidence Bundle (Attach to Release Note / PR Thread)

- [ ] migration versions query output
- [ ] PR B null-count + dedup-index output
- [ ] PR C EXPLAIN setup SQL + EXPLAIN output
- [ ] PR C flag row output (`circular_vouch_depth_3 = false`)
- [ ] Sprint 1 E2E execution notes (OFF/ON, YES/NO, Alice->Bob)
- [ ] metric snapshot links / logs

Final sign-off:

- Operator sign-off:
- Reviewer sign-off:
- Go/No-Go decision:
