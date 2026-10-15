# Human Verification Walkthrough Packet

Use this packet to run a 90-minute, no-code product walkthrough with a non-engineer.

## Goal

Validate whether a real user can complete the core GA flow without help:

1. Sign up
2. Complete 2FA (if enforced)
3. Create/upload JD
4. Forward CV from Gmail to intake address
5. View FitScore reasoning
6. Run boolean search
7. Bulk move candidate
8. Trigger DSR and view retention/compliance output

**Intake and communications (engineering QA extension):** For channel-by-channel acceptance criteria and environment variables, use [`INTAKE_CHANNELS_ACCEPTANCE_MATRIX.md`](./INTAKE_CHANNELS_ACCEPTANCE_MATRIX.md). For staging execution order (WhatsApp, email, boards), use [`STAGING_INTAKE_AND_COMMS_E2E_RUNBOOK.md`](./STAGING_INTAKE_AND_COMMS_E2E_RUNBOOK.md).

## Session Setup (10 minutes)

- **Participant:** 1 non-engineer (preferably external to core engineering team)
- **Facilitator:** 1 person running this script
- **Observer/notetaker:** 1 person capturing friction
- **Environment:** staging or preview environment
- **Recording:** optional, but recommended
- **Rule:** no product coaching unless the participant is completely blocked for >3 minutes

## Facilitator Intro Script (read verbatim)

"Thanks for doing this. We are testing the product, not testing you.  
Please think out loud while you work. If something is confusing, say it immediately.  
I won't help unless you're blocked for a while. If you get stuck, that's useful data for us."

## Participant Task Script (hand this to participant)

1. Create a new account and sign in.
2. If prompted, complete any security step required to continue.
3. Create a job description (or upload one) for a role.
4. Find the CV intake address for that job and forward a candidate resume from Gmail.
5. Locate that candidate in the product.
6. Open the score explanation and describe, in your own words, why the candidate got that score.
7. Search for that candidate using a boolean query (example: `"react" AND "next.js"`).
8. Select the candidate and perform a bulk pipeline action to move stages.
9. Request your data deletion/export (DSR flow) and confirm you can find the compliance/retention output.
10. Tell us what felt hardest or most confusing.

**Optional intake-channel tasks (for technical facilitators or split sessions):**

11. **Web apply:** Open `/apply/<companySlug>` (or link from a job), upload a PDF, submit; confirm the candidate appears for the org (same as email intake visibility checks).
12. **WhatsApp:** On a test phone number, complete consent → send PDF CV → receive scored roles → reply with a job index to apply; confirm application exists (see [`WHATSAPP_CODE_AND_INTERAKT_FLOW_CHECK.md`](./WHATSAPP_CODE_AND_INTERAKT_FLOW_CHECK.md)).
13. **Job board URL:** After distribution is configured, open the external listing’s apply link and confirm it lands on TigerHire `/apply/...` and accepts one submission.

## Observation Template (fill during session)

Copy this table into notes:

| Step                       | Expected Outcome            | Actual Outcome | Time to Complete | Friction Observed | Blocked? (Y/N) | Notes |
| -------------------------- | --------------------------- | -------------- | ---------------- | ----------------- | -------------- | ----- |
| Signup                     | Account created             |                |                  |                   |                |       |
| 2FA                        | Access granted              |                |                  |                   |                |       |
| JD create/upload           | JD available                |                |                  |                   |                |       |
| Email intake               | CV ingested                 |                |                  |                   |                |       |
| Web apply (optional)       | CV ingested via /apply      |                |                  |                   |                |       |
| WhatsApp apply (optional)  | Application from chat       |                |                  |                   |                |       |
| Board apply URL (optional) | Apply link → form → success |                |                  |                   |                |       |
| Reasoning view             | User understands score      |                |                  |                   |                |       |
| Boolean search             | Candidate found             |                |                  |                   |                |       |
| Bulk action                | Stage changed               |                |                  |                   |                |       |
| DSR/compliance             | Request/output visible      |                |                  |                   |                |       |

## Severity Rubric

- **S0 Critical:** Blocks core flow or causes data/security risk. Must fix before external demo.
- **S1 High:** User can proceed only with workaround or repeated retries. Fix this week.
- **S2 Medium:** Confusing, slow, or error-prone but not flow-blocking. Schedule next sprint.
- **S3 Low:** Cosmetic/copy polish. Batch with UX cleanup.

## Triage Board Format (post-session, 15 minutes)

Create issues in this format:

- **Title:** `[Walkthrough][Sx] <short problem>`
- **Step:** `<task step number>`
- **Observed behavior:** `<what happened>`
- **Expected behavior:** `<what should happen>`
- **Evidence:** `<screenshot/video timestamp>`
- **Severity:** `S0|S1|S2|S3`
- **Owner:** `<name>`
- **Target fix date:** `<date>`

## Decision Gate

After triage, classify readiness:

- **Ready for external demo:** no S0, max 1 S1 with known workaround
- **Not ready:** any S0, or 2+ S1 in core flow

## Non-negotiable Rules

- Do not patch issues during session.
- Do not explain hidden system behavior unless participant is hard-blocked.
- Do not discard "small confusion" items; they compound in live demos.

## Outputs Required from This Session

1. Completed observation table
2. Prioritized issue list with severity
3. Demo readiness decision
4. 48-hour remediation plan for S0/S1 items
