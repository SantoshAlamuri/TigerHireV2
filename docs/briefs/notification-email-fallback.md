# Brief #4 — Email fallback for internal notifications

## Problem

Approvers and interviewers who do not use WhatsApp miss time-sensitive actions when only in-app + WA paths exist.

## Solution

`notifyWithEmailFallback` and `sendInternalTaskEmailIfNeeded` when `canSendWhatsApp` is false or recipient has no phone.

### Three transactional emails (Resend)

1. **Pending approval** — shortlist + requisition; deep link `/tasks?task={id}`
2. **Feedback due** — extends overdue nudge with tasks link when no WA
3. **Interview confirmed** — supplemental email with ICS when candidate WA fails

Templates: `pendingApprovalTaskEmailHtml`, `feedbackDueTaskEmailHtml`, `interviewConfirmedTaskEmailHtml` in `email-templates.ts`.

## Wired paths

- `src/app/api/jobs/[id]/pipeline/approve/route.ts`
- `src/lib/workflows/requisition-approval-workflow.ts`
- `src/lib/interviews/scheduling-followups.ts` (feedback)
- `src/lib/interviews/send-booked-invites.ts` (WA failure fallback)

## Tests

`tests/unit/internal-task-email.test.ts`
