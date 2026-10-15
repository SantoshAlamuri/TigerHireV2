# Sprint 1 Referral/Consent Verification Runbook

Launch execution: see `docs/verification/PRELAUNCH_RELEASE_CHECKLIST.md` for consolidated cutover steps.
This document covers Sprint 1 verification flow and evidence checks.

This runbook verifies Sprint 1 fixes for:

- `T1`: WhatsApp referral attribution (`referrers` + `applications.direct_referrer_id`)
- `T2`: `referrals.candidate_id` linkage on CV ingest
- `T3`: referred-candidate consent routing (feature-flagged)
- `T4`: refer-again loop for referrers

Scope excludes orchestrator wiring (`T5`) until Sprint 1 is verified.

---

## 1) Preconditions

- Deploy branch with PR-1 + PR-2 changes to staging.
- Current phase note: production is pre-launch with owner-only testing. This runbook can be executed against production directly until external traffic begins.
- Confirm feature flags:
  - `whatsapp_referral_consent_v2` (T3)
  - `consent_flow` (already required by consent agent)
- Keep `whatsapp_referral_consent_v2` **OFF** for first baseline pass, then **ON** for consent-path pass.
- Confirm WhatsApp template `tigerhire_consent_v2` status in Meta Business Manager is `APPROVED` before enabling T3 in production.

Template-trigger mapping for T3 (pin this in checks):

- Trigger: `captureConsentViaWhatsApp(..., "referred_candidate")`
- Fallback sender: `sendConsentRequest(phone, triggerType)`
- Concrete template: `tigerhire_consent_v2` (body parameter changes by trigger)

---

## 2) Recoverability and Backfill Rehearsal

Run these SQL checks in staging (and then production) before real backfill:

```sql
-- How many sessions still carry referral context?
SELECT count(*)
FROM whatsapp_sessions
WHERE context->>'referral_id' IS NOT NULL;

-- How many referrals still missing candidate links?
SELECT count(*)
FROM referrals
WHERE candidate_id IS NULL;
```

Interpretation:

- If session count is much lower than `referrals.candidate_id IS NULL`, older rows are likely unrecoverable from session context (retention/expiry effect).
- Communicate residual gap explicitly to attribution owner before production run.

Backfill rehearsal:

```bash
npm run backfill:referrals-candidate-id -- --dry-run
```

Dry-run output includes:

- counts (`linked`, `already_linked`, `conflict`, `missing`)
- `conflict_sample` (rows where referral is linked to another candidate)

If conflict count is unexpectedly high, stop and investigate before real run.

Production dry-run checklist (before real production run):

1. Use read-only credentials for dry-run command; write credentials only for real run.
2. Run off-hours and announce start/finish in release channel.
3. Save full dry-run JSON to a reviewable artifact (not terminal-only).
4. Conflict policy:
   - `conflict = 0` -> proceed (after reviewer ack).
   - `0 < conflict <= 5` -> manually review all conflicts before deciding.
   - `conflict > 5` or `conflict_rate > 5%` -> stop and investigate root cause.
5. Name one operator and one reviewer before execution.
6. Real run only after second-person review of dry-run artifact.
7. Save real-run output artifact and link both artifacts in release notes.

Real backfill (single operator, off-hours):

```bash
npm run backfill:referrals-candidate-id
```

Save both dry-run and real-run JSON output to incident/release notes.

---

## 3) Manual E2E Verification Matrix

### A) `whatsapp_referral_consent_v2 = OFF` (legacy branch)

1. Referrer sends `Refer Alice - Backend Engineer - Bangalore`.
2. System asks for Alice phone and creates `referrals` row (`status = pending`).
3. Referrer sends Alice phone.
4. Candidate gets CV request (legacy flow).
5. Candidate sends CV.
6. Verify:
   - `referrals.candidate_id` is populated.
   - `referrals.status` moves to `cv_received` when previously `pending`.
7. Candidate applies to a role via WhatsApp number flow.
8. Verify application row has:
   - `direct_referrer_id` set
   - `parent_referrer_id` set when available.
9. Referrer receives refer-again message.
10. Referrer refers Bob; second `referrals` row is created.

### B) `whatsapp_referral_consent_v2 = ON` (new consent branch)

Repeat the same flow and verify:

- Candidate state goes through `awaiting_consent` path.
- YES branch:
  - consent records inserted in `consent_records`
  - candidate moves to CV request and can continue to application attribution.
  - **Perceived latency (typing):** Within ~1s of the candidate sending `YES` (or the first post-consent inbound), verify **blue ticks (read)** and the **typing** animation on that message before the next bot reply. Same bar for any Alice→Bob step where the candidate sends a normal inbound (not status webhooks).
- NO branch:
  - candidate session moves to `opted_out`
  - no further CV/application prompts sent.

---

## 4) Edge-Case Probe: Referrer Also Becomes Candidate

Run one explicit test where the same phone appears as:

- a referrer in one flow, and
- a candidate in another flow.

Expected for Sprint 1:

- no session corruption,
- no attribution overwrite on existing referral links,
- no hard failure in CV ingest/apply flow.

If collision appears, log as Sprint 2 follow-up (`voucher/referrer dual-state hardening`).

---

## 5) Observability Checks (First 7 Days)

Track these event logs/counters daily:

- `metric.whatsapp_referrer_resolved`
- `metric.whatsapp_referred_candidate_consent_routed`
- `metric.referrals_candidate_linked`

`metric.referrals_candidate_linked.reason` is bounded:

- `linked`
- `status_updated_existing_link`
- `already_linked_same`
- `conflict_other_candidate`
- `referral_not_found`
- `no_referral_id`
- `update_failed`

Suggested verification thresholds (production, 7-day window):

- `metric.whatsapp_referrer_resolved >= 10`
- `metric.whatsapp_referred_candidate_consent_routed >= 5` (when flag ON)
- `metric.referrals_candidate_linked.reason = linked` non-zero
- `conflict_other_candidate / total_referrals_candidate_linked < 5%`
- `update_failed = 0`

If thresholds are not met, Sprint 1 is not considered verified.

Pre-launch override (owner-only traffic):

- If organic volume is too low to hit numeric thresholds, verification may close on successful manual end-to-end matrix execution plus zero critical metric errors.
- Re-enable full numeric threshold enforcement before external-user launch.

---

## 6) Rollback Plan

### PR-1 (`T1/T3/T4`)

- Immediate safety lever: set `whatsapp_referral_consent_v2 = OFF` (disables T3 new path).
- If referral loop or attribution regresses (`T1/T4`), rollback deployment to previous build.

### PR-2 (`T2`)

- Additive writes only; rollback is deployment rollback.
- No destructive DB changes introduced by T2 code path.
- Stop further backfill runs if anomalies appear.

---

## 7) Release Ownership

- **Backfill operator:** single named engineer.
- **Backfill reviewer:** second named engineer (required for dry-run signoff).
- **Window:** off-hours.
- **Order:** dry-run -> review conflict sample -> real run -> capture outputs.
- **Approval:** attribution owner acknowledges residual unrecoverable gap (if any).

---

## 8) Sprint 1 Done Criteria

Sprint 1 is done only when all are true:

- PR-1 and PR-2 deployed.
- Manual E2E matrix passed (flag OFF and flag ON, YES and NO branches).
- Backfill rehearsal + production run completed with captured outputs.
- Metrics above thresholds for 7 consecutive days.
