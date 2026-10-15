# WhatsApp Candidate Interaction Test Plan

This plan verifies the full loop for our key selling point: candidates apply via WhatsApp and then receive recruiter/agency updates.

## Scope

- Candidate can start from WhatsApp and apply to a matched role.
- Recruiter/agency can update application status.
- Candidate receives status updates (WhatsApp + email when available).

## Automated Coverage (Unit)

- `tests/unit/whatsapp-application-bridge.test.ts`
  - Missing candidate context asks for CV again.
  - Out-of-range selection returns valid `1..N` prompt.
  - Closed role is rejected and not applied.
  - Valid selection creates `applications` row and confirms recruiter can see interest.
- `tests/unit/applications-id-route.test.ts`
  - Recruiter status update to shortlisted triggers candidate notifications.
  - Agency role can update status (`rejected` path validated).

## Manual UAT Checklist (Staging)

### A) Candidate applies via WhatsApp

1. Send `Hi` from a fresh candidate number.
   - **Typing / read receipt:** On each inbound you send, confirm **read (blue ticks)** and **typing** appear within ~1s **before** the bot’s next message (fast-path check; typing auto-clears on reply or ~25s).
2. Complete consent flow (`YES`).
   - Same **typing + read** check on the consent reply (permanent quality bar; see `docs/principles/whatsapp-inbound.md`).
3. Upload CV PDF.
   - **Slow-path check:** If your session is **Lane A** (e.g. apply link / campaign context so `job_id` is already on the session when the CV arrives), you should see **“Got your CV…”** (or equivalent), then the **~60 second scoring interim** text, then the verdict. If you only ever hit the **role-picker** path, that interim is the existing “Perfect. I am now evaluating…” line in role selection — not the Lane A-only message.
4. Wait for matches list and reply with a valid number (`1`).
5. Verify candidate receives confirmation that interest is sent.
6. Verify application appears in recruiter/agency pipeline for the selected role.

Expected:

- Application row is created once with correct candidate/job mapping.
- Candidate receives the "interest sent" WhatsApp message.

### B) Recruiter updates status

1. Recruiter opens the created application.
2. Set status to `shortlisted`.
3. Validate candidate receives WhatsApp shortlist message.
4. Validate candidate receives email update when email is present.

Expected:

- Candidate receives timely status communication.
- No duplicate notifications for a single status change.

### C) Agency updates status

1. Agency user opens the same or another application.
2. Set status to `rejected` or `hired`.
3. Validate candidate receives the matching WhatsApp status message.

Expected:

- Agency role has permission to update status.
- Candidate communication reflects final status set by agency.

### D) Negative and reliability checks

1. Candidate replies with an invalid number (`99` when only 3 matches exist).
2. Candidate selects a role that has become closed.
3. Candidate re-selects a role already applied for.

Expected:

- Candidate gets corrective guidance (valid range or role unavailable).
- System avoids duplicate application records.

## Release Gate

Treat WhatsApp candidate interaction as release-blocking unless all pass:

- Automated tests for WhatsApp apply + status notifications are green.
- Manual staging UAT A/B/C pass on the latest deploy.
- No 401/403 webhook auth errors in logs during test window.
