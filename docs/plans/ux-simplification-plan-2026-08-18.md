# UX simplification plan — from "works" to "easy"

**Date:** 2026-08-18 · follows the 9-seat functional audit (~2,560 controls exercised)

The verdict that produced this plan: the product went from broken to working, but not
to simple. Four named causes, one plan item each, ordered by reward-to-effort.

## P0 — WhatsApp interview automation ✅ PROVEN LIVE ON PRODUCTION (2026-08-19)

The most rewarded item: candidates complete screening as a WhatsApp chat with zero
recruiter effort, and scoring runs the moment the last answer lands.

**What exists** (all shipped): session-state machine per phone
(`whatsapp_sessions`), screening Q&A flow, canonical scoring gate, DPDP consent
guard, template fallback, per-phone serialization, DLQ. Business number
**+91 98804 44688** (verified, GREEN quality).

**Live test (production, Finstack TEST org only):**

1. ✅ 3 screening questions seeded on the open Finstack job
2. ✅ Candidate with the operator's number + application created
3. ✅ Screening session armed (`screening_questions`, step 0)
4. ✅ Outbound correctly **blocked** by two compliance layers (session window
   closed; consent guard) — the system refusing to spam an unconsented number is
   a pass, not a failure
5. ✅ Utility opener `th_application_received` delivered and READ — the sanctioned
   first-touch outside the 24h window (marketing templates stay blocked)
6. ✅ Operator replied → armed session fired Q1 in **7 seconds**; 3 questions
   answered in **73 seconds**, next question in 3–7s each
7. ✅ All 3 answers recorded; gate correctly held at `pending_jd_approval`
   (rubric was unapproved — the gate refusing to score is the design working)
8. ✅ JD-Base approved → Inngest reconcile → **FitScore in 46 seconds**, with
   honest reasoning (backend CV vs a compliance JD scored 4/100 with the
   exact gaps named — the rubric does not flatter)

**Product gap found and FIXED on this branch:** screening kick-off silently died
for candidates with no prior WhatsApp contact (session send blocked; the old
fallback used a MARKETING template that the DPDP guard rightly refuses). The
starter now sends the utility opener automatically; any reply resumes the armed
interview.

## P1 — Approval feedback ✅ DONE (branch `claude/approval-stage-feedback`)

Stage-1 approve now toasts _"Approval recorded — now waiting on finance to
approve."_; the final approve toasts _"Requisition fully approved — drafting the
JD now."_ The API surfaces `pendingApproverRoles` from the workflow's existing
`nextActiveRoles`. This removes the walkthrough's single worst moment.

## P2 — One settings home per owner (next PR, ~2–3 days)

Today three trees overlap: `/recruit/settings`, `/company/settings`,
`/setup/hiring-config`. The rule to converge on:

| Tree                | Owner           | Contents                                       |
| ------------------- | --------------- | ---------------------------------------------- |
| `/recruit/settings` | the person      | personal integrations only                     |
| `/company/settings` | the hiring team | screening, pipeline, templates, workflows      |
| `/setup`            | the org admin   | org profile, team, billing, permissions, comms |

Concretely: move the 4 hiring-config pages that still live only under `/setup`
into `/company/settings`, make `/setup/hiring-config/*` redirects, and stop
cross-linking between trees except at the hub level. The route-policy exemption
list then shrinks to one prefix.

## P3 — Pipeline progressive disclosure (~2 days)

178 controls on one screen. Collapse each stage column to summary cards
(count + top 3 by score + "show all N"), and move Bulk/Select/More-tools behind
one "Edit view" toggle. No data changes — presentation only.

## P4 — Self-test mode for demo orgs (~half a day)

The core loop needs two seats and three logins, which makes the operator's own
walkthrough painful. Add `single_approver_mode` (org-level, default OFF, only
settable by super_admin) that collapses the approval chain to one stage for
designated test orgs. Never exposed in customer-facing settings.

## Explicitly not doing

- Another route/IA refactor — remaining complexity is real (approvals, roles,
  tenancy), not accidental. Progressive disclosure over restructuring.
- Collapsing the 4 deliberate duplicate routes (different role gates; see
  ROUTE-MAP.md).
