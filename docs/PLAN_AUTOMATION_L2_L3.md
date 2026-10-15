# Plan automation maturity (L2–L3)

Human-in-the-loop line: the system **prepares, routes, notifies, and executes after a human decision**. Humans **approve, reject, sign-off, and send offers**.

## Evidence requirement

Do not label a step “automated” in product copy unless:

1. A human moved the candidate in pipeline (or explicit config triggered the step), and
2. `plan_history` (or audit tables) shows the side effect.

Preview proof query (one candidate move):

- `plan_candidate_stage_tracking` — row for `plan_id` + `candidate_id` + `plan_stage_id`
- `plan_history` — `event_type` e.g. `candidate_stage_moved`, `comms_sent`, `slot_picker_triggered`

## L2 — System notifies human

| Automation         | Trigger                              | Human still required            |
| ------------------ | ------------------------------------ | ------------------------------- |
| Tasks inbox        | Pending approvals, operational items | Complete **Decide** in `/tasks` |
| Requisition emails | Hiring request submitted             | HM/leadership approve in Tasks  |
| Exception nudge    | Dwell exceeded (when enabled)        | Recruiter clears in Tasks       |

## L3 — Executes after human config (preview / prod gates)

Requires `FF_PLAN_DOCUMENT` + `FF_PLAN_AUTO_EXECUTE` (preview first). WhatsApp templates must be **Meta-approved** before relying on screening auto-invite.

| Automation       | Trigger                                         | `plan_history` event    | Human still required                |
| ---------------- | ----------------------------------------------- | ----------------------- | ----------------------------------- |
| Stage comms      | Pipeline move + `comms_template` on plan stage  | `comms_sent`            | Move in pipeline; candidate consent |
| Screening invite | `phone_screen` + `th_screening_invite` approved | (screening_jobs row)    | Review replies; never auto-reject   |
| Slot picker      | `interview` + interviewer + availability        | `slot_picker_triggered` | Confirm slot / recruiter books      |
| Stage tracking   | Any configured move                             | `candidate_stage_moved` | All stage moves are human-initiated |

## WhatsApp gate (before prod auto-execute)

On **one real job**:

1. Referral or apply → consent captured.
2. At least one `th_*` template delivers successfully.
3. `th_screening_invite` shows **Approved** in Meta.

## Out of scope (L5)

- Auto-move on FitScore alone
- Auto-send offers
- Auto-reject candidates

## Approval gates (`plan_stages.approval_gate`)

Enforced on **pipeline stage move** (not shown in stage setup UI to avoid fake gates):

- `recruiter` / `hm` / `recruiter_and_hm` — shortlist approvals in Tasks
- `finance_recruiter_hm` — shortlist + completed offer finance workflow before entering offer stage
