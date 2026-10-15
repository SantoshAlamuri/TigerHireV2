# Screening v1 Acceptance Checklist

Use this checklist to validate production readiness after implementation.  
Status legend: `[ ]` not started, `[-]` in progress, `[x]` done, `[!]` blocked.

---

## Tier 1 — Verify Before Celebrate (Run Today)

### 1) End-to-end WhatsApp screening (real candidate)

- [ ] Create a test requisition under your own tenant.
- [ ] Apply using your own phone number as candidate.
- [ ] Verify FitScore completes.
- [ ] Verify a `screening_jobs` row is created for candidate + req.
- [ ] Verify WhatsApp greeting + consent prompt arrive.
- [ ] Complete all questionnaire answers.
- [ ] Verify `status='completed'` and `summary_json` populated.
- [ ] Verify recruiter dashboard card reflects summary.
- Notes:

### 2) End-to-end Voice screening (real Bolna call)

- [ ] Enable voice mode for test tenant.
- [ ] Trigger screening flow and accept consent.
- [ ] Receive and complete real call.
- [ ] Verify webhook is accepted (not signature-rejected).
- [ ] Verify audio asset uploaded to Supabase Storage.
- [ ] Verify transcript persisted.
- [ ] Verify `summary_json` + `recommendation` populated.
- [ ] Verify candidate card shows voice-specific details.
- Notes:

### 3) Recruiter override correctness

- [ ] Start a voice screening job.
- [ ] Mid-flight, run `Switch to manual mode`.
- [ ] Verify old job is `cancelled`.
- [ ] Verify old job is not billable.
- [ ] Verify new job is created with `mode='manual'`.
- [ ] Verify new job has `overridden_from_mode='voice'`.
- [ ] Verify billing route does not include cancelled job.
- Notes:

### 4) Opt-out compliance behavior

- [ ] During active screening, candidate replies `STOP`.
- [ ] Verify candidate is marked opt-out (`do_not_call=true` or equivalent).
- [ ] Verify active screening moves to cancelled terminal state.
- [ ] Verify no further outbound screening messages are sent.
- [ ] Verify future screening triggers for this candidate are skipped.
- Notes:

### 5) Free-credit to paid transition

- [ ] Seed or create 10 completed voice jobs in current month.
- [ ] Trigger 11th completed voice job.
- [ ] Verify jobs 1-10 charge `₹0`.
- [ ] Verify 11th charge is `₹99`.
- [ ] Run monthly screening billing route manually.
- [ ] Verify invoice reflects billable count only.
- Notes:

---

## Tier 2 — High-Risk Code Review Checks

### 1) Bolna webhook signature contract

- [ ] Confirm signature header name exactly matches provider docs.
- [ ] Confirm signed payload format matches provider docs (raw body/timestamp rules).
- [ ] Confirm production call webhook validates successfully.
- Files:
  - `src/lib/screening/voice/bolna.ts`
  - `src/app/api/screening/voice/webhook/route.ts`
- Notes:

### 2) Trigger dedup (Inngest + fallback)

- [ ] Verify screening trigger cannot fire twice for same candidate+req active flow.
- [ ] Verify fallback path only runs when Inngest is unavailable.
- [ ] Verify one application event creates at most one active screening job.
- Files:
  - `src/inngest/functions.ts`
  - `src/app/api/applications/route.ts`
  - `src/lib/screening/trigger.ts`
- Notes:

### 3) RLS correctness for `screening_jobs`

- [ ] Confirm SELECT/INSERT/UPDATE/DELETE tenant/org isolation policies exist.
- [ ] Confirm policy helper functions referenced actually exist in DB.
- [ ] Verify cross-tenant API access returns no unauthorized rows.
- Files:
  - `supabase/migrations/20260513160000_screening_v1_phase1.sql`
  - `src/app/api/screening/*`
- Notes:

### 4) Summary extraction robustness

- [ ] Confirm prompt matches spec intent.
- [ ] Confirm WhatsApp mode forces `not_assessed` for voice-only signals.
- [ ] Confirm invalid JSON response handling is safe.
- Files:
  - `src/lib/screening/extract-summary.ts`
- Notes:

### 5) Voice prompt interpolation

- [ ] Confirm `{candidate_name}`, `{company_name}`, `{role_title}` are interpolated before call.
- [ ] Confirm no literal placeholders remain in outbound provider payload.
- Files:
  - `src/lib/screening/voice/bolna.ts`
  - `src/lib/screening/scripts/voice/*.ts`
  - `src/lib/screening/whatsapp-flow.ts`
- Notes:

---

## Tier 3 — Strategic Gaps to Close

### 1) Admin cross-tenant screening usage view

- [ ] Add `/admin/screening-usage` overview with tenant-level usage and spend.
- [ ] Include current month voice count, billable count, MTD spend, cap proximity.
- Notes:

### 2) Manual mode note capture UX

- [ ] Confirm recruiters can add manual screening notes.
- [ ] Confirm notes populate summary block and are visible in candidate card.
- Notes:

### 3) Voice reconcile poller for stuck jobs

- [ ] Add periodic reconciliation for `in_progress` voice jobs older than threshold.
- [ ] Poll provider artifacts and finalize status when webhook is missing.
- Notes:

### 4) Voice-cap fallback scenario

- [ ] Validate cap reached behavior: auto fallback to WhatsApp.
- [ ] Verify override marker (`overridden_from_mode='voice'` or equivalent) is recorded.
- [ ] Verify recruiter notification on cap fallback.
- Notes:

### 5) Monthly free-credit reset logic

- [ ] Verify free credits reset at calendar month boundary.
- [ ] Confirm query window is month-based, not rolling 30-day.
- [ ] Confirm billing and eligibility logic use same boundary definition.
- Notes:

---

## Recommended Execution Order

1. Tier 1 all five tests (runtime truth)
2. Tier 2 code review checks
3. Implement Tier 3 #3 (reconcile poller)
4. Implement Tier 3 #1 (admin usage view)
5. Re-run one full end-to-end on a second phone number

---

## Sign-off

- Owner:
- Date:
- Environment:
- Ready for pilot demos: [ ] Yes [ ] No
- Blocking issues:
