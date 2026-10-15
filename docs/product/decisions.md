# Product decisions log

Recorded choices that audits and engineers should treat as settled unless product explicitly revisits them.

---

## Interview calendar: ICS-by-email (not Calendar API)

**Decision:** Deliver interview calendar invites as **ICS attachments on email**, not via Google Calendar / Microsoft Graph server-side event creation.

**Why:**

- Company-wide OAuth for TigerHire as a calendar app is an **IT procurement** step per customer (often multi-week).
- Indian SMB buyers rarely complete that before trying scheduling.
- ICS opens in every mail client and adds events locally with **no IT approval**.

**Implications:**

- Recruiter dashboard booking must **not** require connected Google/Outlook/Teams, Daily/Zoom, or transcription providers.
- Optional calendar connections in Settings are **profile metadata only** until a future phase explicitly adds API sync.
- Do not flag “missing calendar API” as a P0 bug in audits.

**Related code:** `src/lib/interviews/send-booked-invites.ts`, `src/lib/interviews/ics.ts`, `POST /api/jobs/[id]/interviews/book`.

---

## Interview booking: notification failure UX (Option B)

**Decision:** **Book first, surface delivery failures, allow resend** — do not roll back the slot when Resend/WhatsApp blips.

**Why:**

- Infrastructure outages are often transient; blocking booking forces recruiters to re-select slots.
- The booking (held slot + pipeline `interview_scheduled_at`) is the valuable state; delivery is recoverable.

**Critical channels** (tracked on `interview_availability_slots`, banner + resend):

- Candidate email
- Candidate WhatsApp (when org WhatsApp channel is enabled and candidate has a phone)
- Interviewer email with ICS attachment

**Non-critical:** Interviewer WhatsApp, recruiter copies, audit log write failures — log and continue.

**Schema:** `candidate_email_status`, `interviewer_email_status`, `candidate_whatsapp_status`, `last_delivery_attempt_at`.

**API:** `POST /api/interview-slots/[id]/resend-invites` retries **failed channels only**.

**Related code:** `src/lib/interviews/delivery-status.ts`, `src/lib/interviews/run-booked-delivery.ts`.

---
