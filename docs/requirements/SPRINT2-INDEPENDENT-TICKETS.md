# Sprint 2 Independent Tickets (Execution Spec)

Launch execution: see `docs/verification/PRELAUNCH_RELEASE_CHECKLIST.md` for consolidated cutover steps.
This document defines implementation scope and acceptance criteria.

Purpose: execution-ready tickets for the independent Sprint 2 scope, **without** touching Sprint 1 dependency items.

Last updated: 2026-04-25

---

## Scope in this doc

Included (independent):

- Verify hardening/turn-on clarity
- Fraud-detector kill-switch + hardening
- Vouch specificity rubric tightening
- Vouch weight math fix for `rehire_intent = not_sure`
- Referral abuse guards (cap, dedup, self-referral block)
- OTP send rate limit per phone (+IP as secondary)
- Circular vouch depth-3 detection

Excluded (Sprint 1 dependent): vouch free-text fallback, voucher dual-state, Q3 echo-back, vouch nudges/social proof, referral parser Claude-extract, candidate-side referral confirmation.

---

## PR A — Trust Scoring Fixes

Theme: trust score becomes reliably actionable while controlling Claude spend.

### Hard precondition (must pass before PR A merge)

- Capture and attach **production flag snapshot** for:
  - `verify_agent`
  - `ghostbuster_authenticity_agent` (if introduced by PR A migration)
- Snapshot artifact must include: timestamp, environment/project id, raw `feature_flags` rows.
- If snapshot is missing, PR A is not mergeable.

### A1) Verify hardening (budget + explicit starting-state turn-on)

- **Starting state**
  - `verify_agent` flag exists and gates execution.
  - Schema seed default is `enabled=true` (`supabase/schema/36_rate_limit_and_flags.sql`).
  - Runtime behavior when flag row is missing is effectively ON (`isEnabled` uses `data?.enabled ?? true`).
  - Verify runs from Scout/WhatsApp/admin call paths when flag is on.
  - No explicit per-candidate budget cap (calls/tokens).
- **Files**
  - `src/lib/agents/verify.ts`
  - `src/lib/agents/scout.ts`
  - `src/lib/whatsapp/handler.ts`
  - `src/lib/whatsapp/lane-a.ts`
  - `src/lib/config/env.ts` (if env budget knobs added)
  - `docs/FEATURE_FLAGS.md`
- **Acceptance criteria**
  - Add bounded per-candidate verify budget controls (calls and/or tokens).
  - Preserve `verify_agent` as primary rollback lever.
  - Lane A verify failures are logged/observable (no silent swallow).
  - Metric event emitted per invoke: `metric.verify_invoked` with bounded `reason`.
- **Tests**
  - Unit: verify disabled -> no work.
  - Unit: budget exceeded -> controlled skip with expected metric `reason`.
  - Unit: metric call-shape assertion (`candidate_id`, `success`, `reason`, `claude_calls`, `claude_tokens`).
- **Rollback lever**
  - `verify_agent` flag OFF.
  - Budget env values can be loosened/tightened without logic change.
- **Gotchas**
  - Rollout note: if production row is unexpectedly OFF, include explicit flag flip as deploy checklist step; otherwise this ticket is pure hardening.

### A2) Candidate Authenticity Check kill-switch (default ON) + budget hardening

- **Starting state (pre-ticket baseline)**
  - No dedicated Candidate Authenticity Check feature flag (`ghostbuster_authenticity_agent`).
  - `runGhostbuster` executed everywhere it was invoked (internal name; agent type key remains `ghostbuster`).
- **Files**
  - `src/lib/agents/ghostbuster-authenticity.ts`
  - `src/lib/agents/run-pipeline.ts`
  - `src/app/api/agents/ghostbuster/route.ts`
  - `supabase/schema/36_rate_limit_and_flags.sql` (or equivalent seed path)
  - `docs/FEATURE_FLAGS.md`
- **Acceptance criteria**
  - Add `ghostbuster_authenticity_agent` flag with **default ON** (migration-safe behavior).
  - Missing-row behavior is ON in code (`enabled ?? true`) so deploy order cannot create a temporary OFF window.
  - When `ghostbuster_authenticity_agent` is OFF, authenticity logic cleanly short-circuits.
  - Add per-candidate budget controls analogous to verify.
  - Metric event emitted: `metric.ghostbuster_invoked` with bounded `reason`.
- **Tests**
  - Unit: flag OFF short-circuit path.
  - Unit: flag ON normal path.
  - Unit: metric call-shape assertion.
- **Rollback lever**
  - `ghostbuster_authenticity_agent` flag OFF (immediate kill-switch).
- **Gotchas**
  - This is adding a kill-switch to a currently always-on path; default must not regress existing behavior.

### A3) Tighten vouch specificity rubric (artifacts > adjectives)

- **Starting state**
  - Specificity scoring exists but prompt does not explicitly enforce artifact-first evidence.
  - Fallback parsing can mask weak output.
- **Files**
  - `src/lib/agents/vouch.ts`
  - `src/lib/agents/schemas.ts` (if schema bounds refined)
- **Acceptance criteria**
  - Prompt/rubric explicitly prioritizes concrete artifacts (metrics, systems, outcomes, examples) over adjectives.
  - Output constraints remain bounded and parseable.
  - Add temporary fallback lever for first-week rollback (flag or dual prompt selector).
- **Tests**
  - Unit: >=6 golden fixtures from **scrubbed real vouch samples** (3 artifact-rich, 3 adjective-heavy).
  - Fixture source is mandatory, not optional: store under `tests/fixtures/vouch-rubric/` with redaction notes.
  - If real samples are unavailable, implementation must include explicit reviewer-approved waiver in PR description.
  - Assertions use score ranges (not exact values) to reduce model nondeterminism flake.
  - Optional stabilization path: run each fixture N times and assert aggregate ordering if range checks are noisy.
  - Unit: metric/assertion for chosen rubric path if flagged.
- **Rollback lever**
  - Revert to old rubric path (feature flag preferred for week-1 safety).
- **Gotchas**
  - Keep output schema stable so downstream vouch writes don’t break.

### A4) Vouch weight math fix (`not_sure` neutral/non-positive)

- **Starting state**
  - `rehire_intent` is stored but not used in weight calculation.
- **Files**
  - `src/lib/agents/vouch.ts`
  - `src/lib/agents/trust-score.ts` (only if downstream assumptions need adjustment)
- **Acceptance criteria**
  - `calculateVouchWeight` explicitly incorporates `rehire_intent`.
  - Locked mapping for rehire intent factor:
    - `yes_definitely` = `+15`
    - `yes_right_role` = `+5`
    - `not_sure` = `0`
  - Metric event emitted only when new rehire-intent factor materially changes the final weight vs baseline (`metric.vouch_weight_calculated_delta`).
- **Tests**
  - Unit matrix: yes / no / not_sure with fixed other factors.
  - Unit: `yes_definitely > yes_right_role > not_sure` monotonic ordering assertion.
  - Unit: downstream compatibility assertion that persisted `vouches.weight` remains within schema bounds (`0..100`) and trust-score recomputation path does not error.
  - Unit: metric call-shape assertion on delta path.
- **Rollback lever**
  - Code revert (or optional flag for side-by-side comparison).
- **Gotchas**
  - Schema enforces `vouches.weight >= 0`; negative persisted weights are invalid by design.
  - `trust-score` currently uses vouch count and `weight >= 80` bonuses, so this change impacts trust via reduced high-weight incidence, not negative arithmetic in persisted weight.

---

## PR B — Abuse Hardening

Theme: make referral and OTP entry points resilient to gaming and abuse.

### B1) Per-referrer-per-day cap at referral entry

- **Starting state**
  - WhatsApp referral insert path has no daily cap.
- **Files**
  - `src/lib/whatsapp/referral-handler.ts`
  - `src/lib/config/env.ts` (limit values)
  - optional migration if additional index/support column needed
- **Acceptance criteria**
  - Cap enforced by canonical identity key in this order:
    1. `referrer_referrers_id` (`referrers.id`) when available,
    2. fallback to normalized referrer phone if identity row is unavailable.
  - Limit value configurable via env (no deploy needed to tune).
  - Metric emitted: `metric.referral_rate_limited` with bounded `reason`.
- **Tests**
  - Unit: under-cap passes, over-cap blocks.
  - Unit: metric call-shape assertion.
- **Rollback lever**
  - Env cap increase / disable toggle.

### B2) Target-phone dedup on referral entry

- **Starting state**
  - No explicit dedup by `(referrer, target_phone, window)` on WhatsApp referral flow.
- **Files**
  - `src/lib/whatsapp/referral-handler.ts`
  - migration to add `referrals.target_phone` (normalized, nullable initially)
  - index/constraint migration for dedup query performance
- **Acceptance criteria**
  - Duplicate referral attempts for same `(referrer_identity, target_phone, rolling_window)` are blocked per rule.
  - Dedup enforcement uses persisted normalized `target_phone` in `referrals` (DB-backed path, not session-only inference).
  - Response copy is deterministic and non-ambiguous.
- **Tests**
  - Unit/integration: first accept, duplicate reject/merge.
- **Rollback lever**
  - Feature flag or env disable for dedup rule.
- **Gotchas**
  - Migration ordering is mandatory: run DB migration (`target_phone` + index) first, confirm it landed, then deploy app code that reads/writes `target_phone`.
  - Historical behavior: dedup is guaranteed for rows created after migration; pre-migration rows may have `target_phone IS NULL` and are out-of-scope unless a separate backfill is run.

### B3) Self-referral block (referrer phone != candidate phone)

- **Starting state**
  - Vouch self-check exists; referral entry self-check missing.
- **Files**
  - `src/lib/whatsapp/referral-handler.ts`
- **Acceptance criteria**
  - If referrer phone equals target candidate phone (normalized), block and do not advance session.
  - Metric event uses bounded reason (e.g. `self_referral_blocked`).
- **Tests**
  - Unit: equal phones blocked, unequal phones allowed.
- **Rollback lever**
  - Feature flag for self-referral block if needed.

### B4) OTP send rate limit: phone-primary, IP-secondary

- **Starting state**
  - OTP send route keyed by IP only.
- **Files**
  - `src/app/api/refer/otp/send/route.ts`
  - `src/lib/config/env.ts` (phone/IP limit knobs)
  - optional `src/lib/security/rate-limit.ts` helper updates
- **Acceptance criteria**
  - Phone-keyed rate limit is primary control.
  - IP limit retained as secondary guard with higher threshold (both can block; phone threshold is stricter).
  - Limit values configurable via env.
- **Tests**
  - Route tests: phone limit hit, IP limit hit, both pass under threshold.
- **Rollback lever**
  - Runtime limit tuning via env vars.
- **Gotchas**
  - Avoid over-aggressive IP-only blocking for CGNAT/shared networks.

---

## PR C — Circular Vouch Depth-3

Theme: block obvious collusion rings without expensive deep-graph complexity.

### C1) Depth-3 cycle detection (A -> B -> C -> A)

- **Starting state**
  - Existing logic blocks pairwise cycles (A<->B) only.
- **Decision lock**
  - Scope is **depth-3 max** for v1 (do not chase deeper rings in this ticket).
- **Files**
  - `src/lib/agents/vouch.ts` (or extracted helper module)
  - DB-side query helper (3-hop join/CTE) + supporting indexes as needed
- **Acceptance criteria**
  - Pairwise cycle block remains intact.
  - New vouch is blocked when it closes a depth-3 ring.
  - Metric emitted: `metric.circular_vouch_blocked` with bounded fields (`depth`, `reason`).
  - Performance guardrail: cycle check stays under 200ms p95 at 10x current vouch volume test fixture.
  - Merge artifact includes `EXPLAIN ANALYZE` output for the depth-3 check query against synthetic 10x fixture data, with expected index usage on vouch/candidate lookups.
  - `circular_vouch_depth_3` flag is explicitly seeded `enabled=false` in migration (missing-row default in `isEnabled` is ON).
- **Tests**
  - Unit fixtures:
    - A<->B blocked
    - A->B->C->A blocked
    - non-cyclic chain allowed
  - Metric call-shape assertion.
- **Rollback lever**
  - Feature flag recommended for first rollout week.
- **Gotchas**
  - Keep phone normalization consistent across all graph edges.

---

## Metric Policy (Sprint 2)

All new counters must use bounded reason enums and include call-shape assertions in tests.

Required counters:

- `metric.verify_invoked`
- `metric.ghostbuster_invoked`
- `metric.vouch_weight_calculated_delta`
- `metric.referral_rate_limited` (hash phones, never log raw phone)
- `metric.circular_vouch_blocked`

Each metric must include:

- bounded reason enum
- call-shape assertion in unit tests
- operator-visible rollback note (flag/env and owner role)
- for every new flag, explicitly document missing-row behavior (`isEnabled` default path) and desired rollout default (ON/OFF) so intent is not inferred from wrapper defaults.

---

## Execution Order

1. PR A (trust scoring) — merge with flags/kill-switches and metrics asserted.
2. PR B (abuse hardening) — **apply migration first**, then merge/deploy runtime-tunable limits.
3. PR C (depth-3 circular vouch) — isolated review unit.

No implementation should begin until this ticket doc is reviewed and approved.

### PR B merge gate addendum

- Capture post-migration artifact before declaring PR B complete:
  - timestamp + project ref
  - `SELECT count(*) FROM referrals WHERE target_phone IS NULL`
  - evidence that `idx_referrals_referrer_target_phone_created_at` exists

---

## Rollback Operator Path (Cross-cutting)

- Flag flips via `feature_flags` (`super_admin` path / SQL update through approved operator).
- Rate-limit tuning via env vars (owner: on-call backend engineer).
- Prompt fallback toggle (owner: on-call backend engineer + product owner acknowledgement).
- Every ticket rollout checklist must name:
  - operator
  - reviewer
  - max mitigation time target (<= 5 minutes for flag/env rollback).
